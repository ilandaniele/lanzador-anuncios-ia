import { COPY_VARIANTS_PER_GENERATION } from "../../../shared/constants";
import {
  type AiCopyVariant,
  aiCopyVariantsSchema,
  type GenerateCopiesRequest,
} from "../../../shared/schemas/copies";
import type { Env } from "../../env";
import { resolveAiProvider } from "../../integrations/ai/resolve-provider";
import type { AiProvider } from "../../integrations/ai/provider";
import { AppError, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { logEvent } from "../../lib/logger";
import { now } from "../../lib/time";
import { insertCopies } from "../../repositories/product-copies";
import { findProduct } from "../../repositories/products";
import type { Scope } from "../../repositories/scope";
import { assertAiBudget, recordAiUsage } from "../ai-budget";
import { exceedsCopyLimits, toCopyDto, toFlag } from "../product-copies";
import {
  buildCopyPrompt,
  buildCopyRetryPrompt,
  COPY_SYSTEM_PROMPT,
} from "./prompts/copies";

const MAX_OUTPUT_TOKENS = 2000;

const invalidResponse = () =>
  new AppError(502, "AI_UPSTREAM", { message: "Invalid copy variants" });

const parseVariants = (text: string): AiCopyVariant[] => {
  const json: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  })();
  const parsed = aiCopyVariantsSchema.safeParse(json);
  if (!parsed.success) throw invalidResponse();
  return parsed.data.variants.slice(0, COPY_VARIANTS_PER_GENERATION);
};

const exceedsLimits = ({ primaryText, headline, description }: AiCopyVariant) =>
  exceedsCopyLimits({
    primaryText,
    headline,
    description: description || null,
  });

async function requestVariants(
  env: Env,
  provider: AiProvider,
  scope: Scope,
  productId: string,
  prompt: string,
) {
  const { text, usage } = await provider.generateText({
    system: COPY_SYSTEM_PROMPT,
    prompt,
    json: true,
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  await recordAiUsage(env.DB, scope.workspaceId, "copy", usage, {
    userId: scope.userId,
    refId: productId,
  });
  try {
    return parseVariants(text);
  } catch (error) {
    logEvent("warn", "ai.copy_invalid_response", { productId });
    throw error;
  }
}

export async function generateCopies(
  env: Env,
  scope: Scope,
  productId: string,
  { angle, customAngle }: GenerateCopiesRequest,
) {
  const product = await findProduct(env.DB, scope, productId);
  if (!product) throw notFound();
  await assertAiBudget(env.DB, env, scope.workspaceId);

  const provider = resolveAiProvider(env);
  const prompt = buildCopyPrompt({ product, angle, customAngle });
  let variants = await requestVariants(env, provider, scope, productId, prompt);
  if (variants.some(exceedsLimits)) {
    variants = await requestVariants(
      env,
      provider,
      scope,
      productId,
      buildCopyRetryPrompt(prompt),
    );
  }

  const at = now();
  const saved = await insertCopies(
    env.DB,
    scope,
    variants.map((variant) => ({
      id: newId(),
      productId,
      angle,
      customAngle: customAngle ?? null,
      primaryText: variant.primaryText,
      headline: variant.headline,
      description: variant.description || null,
      source: "ai",
      policyRisk: variant.policyRisk,
      policyNote: variant.policyNote || null,
      overLimit: toFlag(exceedsLimits(variant)),
      createdAt: at,
      updatedAt: at,
    })),
  );
  return { data: saved.map(toCopyDto) };
}
