import { z } from "zod";
import type { Env } from "../../env";
import { resolveAiProvider } from "../../integrations/ai/resolve-provider";
import { AppError } from "../../lib/errors";
import { logEvent } from "../../lib/logger";
import type { Scope } from "../../repositories/scope";
import {
  buildPilotPrompt,
  PILOT_EXPLANATION_MAX_LENGTH,
  PILOT_SYSTEM_PROMPT,
  type PilotPromptProposal,
} from "../ai/prompts/pilot";
import { assertAiBudget, recordAiUsage } from "../ai-budget";

const MAX_OUTPUT_TOKENS = 2000;

const explanationsSchema = z.record(z.string(), z.string());

export interface ExplainContext {
  runId: string;
  userId: string | null;
}

function parseExplanations(text: string, proposals: PilotPromptProposal[]) {
  const json: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  })();
  const parsed = explanationsSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(502, "AI_UPSTREAM", {
      message: "Invalid pilot explanations",
    });
  }
  return new Map(
    proposals.flatMap(({ id }) => {
      const explanation = parsed.data[id]?.trim();
      return explanation
        ? [[id, explanation.slice(0, PILOT_EXPLANATION_MAX_LENGTH)] as const]
        : [];
    }),
  );
}

async function requestExplanations(
  env: Env,
  scope: Scope,
  proposals: PilotPromptProposal[],
  { runId, userId }: ExplainContext,
) {
  await assertAiBudget(env.DB, env, scope.workspaceId);
  const { text, usage } = await resolveAiProvider(env).generateText({
    system: PILOT_SYSTEM_PROMPT,
    prompt: buildPilotPrompt(proposals),
    json: true,
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  await recordAiUsage(env.DB, scope.workspaceId, "pilot", usage, {
    userId,
    refId: runId,
  });
  return parseExplanations(text, proposals);
}

export async function explainProposals(
  env: Env,
  scope: Scope,
  proposals: PilotPromptProposal[],
  context: ExplainContext,
): Promise<Map<string, string>> {
  if (proposals.length === 0) return new Map();
  try {
    return await requestExplanations(env, scope, proposals, context);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    logEvent("warn", "ai.pilot_without_explanations", {
      runId: context.runId,
      code: error.code,
    });
    return new Map();
  }
}
