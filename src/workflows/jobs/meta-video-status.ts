import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import type { Env } from "../../api/env";
import {
  readVideoStatus,
  readVideoThumbnail,
} from "../../api/integrations/meta/upload";
import { now } from "../../api/lib/time";
import {
  findProcessingVideo,
  markVideoFailed,
  markVideoReady,
} from "../../api/repositories/creative-videos";
import type { Scope } from "../../api/repositories/scope";
import { getGraphForAsset } from "../../api/services/meta/connection";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const JOB_USER_ID = "job:meta_video_status";
const MAX_ATTEMPTS = 20;
const SECOND_MS = 1000;
const INITIAL_DELAYS_MS = [10 * SECOND_MS, 20 * SECOND_MS, 30 * SECOND_MS];
const STEADY_DELAY_MS = 60 * SECOND_MS;

const VIDEO_ERROR = "VIDEO_PROCESSING_FAILED";
const VIDEO_TIMEOUT = "VIDEO_PROCESSING_TIMEOUT";
const VIDEO_UNAVAILABLE = "VIDEO_STATUS_UNAVAILABLE";

const payloadSchema = z.object({ creativeId: z.string().min(1) });

const jobScope = (workspaceId: string): Scope => ({
  workspaceId,
  userId: JOB_USER_ID,
  role: "viewer",
});

const delayBeforeAttempt = (attempt: number) =>
  INITIAL_DELAYS_MS[attempt - 1] ?? STEADY_DELAY_MS;

interface VideoTarget {
  adAccountAssetId: string;
  metaVideoId: string;
}

const graphFor = (env: Env, scope: Scope, { adAccountAssetId }: VideoTarget) =>
  getGraphForAsset(env.DB, env, scope, adAccountAssetId).then(
    ({ graph }) => graph,
  );

async function checkStatus(env: Env, scope: Scope, target: VideoTarget) {
  const graph = await graphFor(env, scope, target);
  const { status, width, height } = await readVideoStatus(
    graph,
    target.metaVideoId,
  );
  return { status, width: width ?? null, height: height ?? null };
}

async function storeReady(
  env: Env,
  scope: Scope,
  creativeId: string,
  target: VideoTarget,
  { width, height }: { width: number | null; height: number | null },
) {
  const graph = await graphFor(env, scope, target);
  const thumbnailUrl = await readVideoThumbnail(graph, target.metaVideoId);
  const horizontal = width !== null && height !== null && width > height;
  await markVideoReady(
    env.DB,
    scope,
    creativeId,
    {
      thumbnailUrl,
      width,
      height,
      formatWarning: horizontal ? "horizontal" : null,
    },
    now(),
  );
}

export const metaVideoStatusJob: JobHandler = async ({
  env,
  step,
  workspaceId,
  payload,
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!workspaceId || !parsed.success) {
    throw new NonRetryableError("Invalid meta_video_status job");
  }
  const { creativeId } = parsed.data;
  const scope = jobScope(workspaceId);
  const fail = (error: string) =>
    step.do("mark failed", JOB_STEP_CONFIG, () =>
      markVideoFailed(env.DB, scope, creativeId, error, now()),
    );

  const target = await step.do("load video", JOB_STEP_CONFIG, async () => {
    const video = await findProcessingVideo(env.DB, scope, creativeId);
    if (!video) return null;
    if (!video.metaVideoId) {
      throw new NonRetryableError("Video creative has no meta_video_id");
    }
    return { ...video, metaVideoId: video.metaVideoId };
  });
  if (!target) return;

  const poll = async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await step.sleep(`wait ${attempt}`, delayBeforeAttempt(attempt));
      const check = await step.do(`check ${attempt}`, JOB_STEP_CONFIG, () =>
        checkStatus(env, scope, target),
      );
      if (check.status === "ready") {
        await step.do("store ready", JOB_STEP_CONFIG, () =>
          storeReady(env, scope, creativeId, target, check),
        );
        return null;
      }
      if (check.status === "error") return VIDEO_ERROR;
    }
    return VIDEO_TIMEOUT;
  };

  const failure = await poll().catch(async (error: unknown) => {
    await fail(VIDEO_UNAVAILABLE);
    throw error;
  });
  if (failure) await fail(failure);
};
