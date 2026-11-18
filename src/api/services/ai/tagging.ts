import { FILE_LIMITS } from "../../../shared/constants";
import { renderNameTemplate } from "../../../shared/name-templates";
import {
  type AiCreativeTags,
  aiCreativeTagsSchema,
} from "../../../shared/schemas/creatives";
import type { Env } from "../../env";
import type { AiImage } from "../../integrations/ai/provider";
import { resolveAiProvider } from "../../integrations/ai/resolve-provider";
import {
  fetchMetaThumbnail,
  parseThumbnailUrl,
} from "../../integrations/meta/thumbnail";
import { AppError, conflict, notFound } from "../../lib/errors";
import { logEvent } from "../../lib/logger";
import { slugify } from "../../lib/slug";
import { now } from "../../lib/time";
import {
  applyCreativeTags,
  findTaggingTarget,
  setCreativeAiStatus,
  type TaggingTarget,
} from "../../repositories/creatives";
import type { Scope } from "../../repositories/scope";
import { assertAiBudget, recordAiUsage } from "../ai-budget";
import { toCreativeDto } from "../creatives";
import { enqueueJob } from "../jobs";
import { buildTaggingPrompt, TAGGING_SYSTEM_PROMPT } from "./prompts/tagging";

const MAX_OUTPUT_TOKENS = 600;
const CONTACT_SHEET_CONTENT_TYPE = "image/jpeg";
const NAME_PART_MAX = 30;

export interface ContactSheet {
  contentType?: string;
  body: ArrayBuffer;
}

const invalidResponse = () =>
  new AppError(502, "AI_UPSTREAM", { message: "Invalid creative tags" });

const parseTags = (text: string): AiCreativeTags => {
  const json: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  })();
  const parsed = aiCreativeTagsSchema.safeParse(json);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
};

export const isBudgetExhausted = (error: unknown) =>
  error instanceof AppError && error.code === "AI_BUDGET_EXHAUSTED";

const suggestAdName = (
  { adNameTemplate, nameSequence }: TaggingTarget,
  { hook, angle, format }: AiCreativeTags,
) =>
  adNameTemplate
    ? renderNameTemplate(adNameTemplate, {
        hook: slugify(hook, NAME_PART_MAX),
        formato: format,
        angulo: slugify(angle, NAME_PART_MAX),
        n: nameSequence,
      })
    : null;

async function rejectTagging(
  env: Env,
  scope: Scope,
  creativeId: string,
  error: unknown,
): Promise<never> {
  await setCreativeAiStatus(
    env.DB,
    scope,
    creativeId,
    isBudgetExhausted(error) ? "pending" : "failed",
    now(),
  );
  throw error;
}

async function describeAndStore(
  env: Env,
  scope: Scope,
  userId: string | null,
  creative: TaggingTarget,
  image: AiImage,
) {
  await assertAiBudget(env.DB, env, scope.workspaceId);
  const { text, usage } = await resolveAiProvider(env).describeImage({
    system: TAGGING_SYSTEM_PROMPT,
    prompt: buildTaggingPrompt(creative.originalFilename),
    image,
    json: true,
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  await recordAiUsage(env.DB, scope.workspaceId, "tagging", usage, {
    userId,
    refId: creative.id,
  });
  let tags: AiCreativeTags;
  try {
    tags = parseTags(text);
  } catch (error) {
    logEvent("warn", "ai.tagging_invalid_response", {
      creativeId: creative.id,
    });
    throw error;
  }
  const row = await applyCreativeTags(
    env.DB,
    scope,
    creative.id,
    {
      tags,
      aiModel: usage.model,
      adNameSuggested: suggestAdName(creative, tags),
    },
    now(),
  );
  if (!row) throw notFound();
  return row;
}

const tagImage = (
  env: Env,
  scope: Scope,
  userId: string | null,
  creative: TaggingTarget,
  image: AiImage,
) =>
  describeAndStore(env, scope, userId, creative, image).catch((error) =>
    rejectTagging(env, scope, creative.id, error),
  );

async function taggingTargetOrThrow(env: Env, scope: Scope, id: string) {
  const creative = await findTaggingTarget(env.DB, scope, id);
  if (!creative) throw notFound();
  return creative;
}

function readySheet({ contentType, body }: ContactSheet): AiImage {
  if (contentType?.toLowerCase() !== CONTACT_SHEET_CONTENT_TYPE) {
    throw new AppError(415, "UNSUPPORTED_TYPE");
  }
  if (body.byteLength > FILE_LIMITS.contactSheetMaxBytes) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE");
  }
  if (body.byteLength === 0) {
    throw new AppError(400, "VALIDATION", { fields: { body: "empty" } });
  }
  return { bytes: new Uint8Array(body), mimeType: CONTACT_SHEET_CONTENT_TYPE };
}

export async function tagFromContactSheet(
  env: Env,
  scope: Scope,
  creativeId: string,
  sheet: ContactSheet,
) {
  const creative = await taggingTargetOrThrow(env, scope, creativeId);
  const row = await tagImage(
    env,
    scope,
    scope.userId,
    creative,
    readySheet(sheet),
  );
  return { tags: toCreativeDto(row).tags };
}

function readyThumbnailUrl({ status, thumbnailUrl }: TaggingTarget) {
  if (status !== "ready" || !thumbnailUrl) throw conflict("CREATIVE_NOT_READY");
  return thumbnailUrl;
}

export async function retagCreative(
  env: Env,
  scope: Scope,
  creativeId: string,
) {
  const creative = await taggingTargetOrThrow(env, scope, creativeId);
  parseThumbnailUrl(readyThumbnailUrl(creative));
  const at = now();
  await assertAiBudget(env.DB, env, scope.workspaceId)
    .then(() => setCreativeAiStatus(env.DB, scope, creativeId, "queued", at))
    .then(() =>
      enqueueJob(env, {
        kind: "tag_creative",
        key: `${creativeId}-${at}`,
        workspaceId: scope.workspaceId,
        payload: { creativeId },
      }),
    )
    .catch((error) => rejectTagging(env, scope, creativeId, error));
  return { aiStatus: "queued" as const };
}

export async function tagFromThumbnail(
  env: Env,
  scope: Scope,
  creativeId: string,
) {
  const creative = await taggingTargetOrThrow(env, scope, creativeId);
  const image = await fetchMetaThumbnail(readyThumbnailUrl(creative)).catch(
    (error) => rejectTagging(env, scope, creativeId, error),
  );
  await tagImage(env, scope, null, creative, image);
}
