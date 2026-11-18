import type { WorkflowStep, WorkflowStepContext } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import type { Env } from "../../api/env";
import { uploadImage } from "../../api/integrations/meta/upload";
import { now } from "../../api/lib/time";
import {
  findImportingCreative,
  markImportedImage,
  markImportedVideo,
  markImportFailed,
} from "../../api/repositories/drive-imports";
import { markGoogleReconnectRequired } from "../../api/repositories/google-connections";
import type { Scope } from "../../api/repositories/scope";
import { enqueueJob } from "../../api/services/jobs";
import { getGraphForAsset } from "../../api/services/meta/connection";
import { ROLE_RANK } from "../../shared/constants";
import { driveFileIdSchema } from "../../shared/schemas/google";
import {
  assertDriveFileMatches,
  DRIVE_CREATOR_REMOVED,
  DRIVE_RECONNECT,
  driveFailureMessage,
  driveRangeReader,
  isUserFacingFailure,
  needsGoogleReconnect,
} from "../lib/drive-reader";
import { type MetaStepRunner, runMetaStep } from "../lib/meta-step";
import { runResumableUpload } from "../lib/resumable-upload";
import { SubrequestBudget } from "../lib/subrequest-budget";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const JOB_USER_ID = "job:drive_import_file";

const payloadSchema = z.object({
  creativeId: z.string().min(1),
  fileId: driveFileIdSchema,
  adAccountAssetId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  videoId: z.string().min(1).optional(),
  startOffset: z.int().nonnegative().optional(),
  endOffset: z.int().nonnegative().optional(),
});

type DriveImportPayload = z.infer<typeof payloadSchema>;

type ImportingCreative = NonNullable<
  Awaited<ReturnType<typeof findImportingCreative>>
>;

interface ImportContext {
  env: Env;
  step: WorkflowStep;
  scope: Scope;
  job: DriveImportPayload;
  creative: ImportingCreative;
}

const scopeFor = (workspaceId: string, userId: string): Scope => ({
  workspaceId,
  userId,
  role: "editor",
});

const withJobRetries = (step: WorkflowStep): MetaStepRunner => ({
  do: (<T extends Rpc.Serializable<T>>(
    name: string,
    callback: (ctx: WorkflowStepContext) => Promise<T>,
  ) => step.do(name, JOB_STEP_CONFIG, callback)) as MetaStepRunner["do"],
  sleep: (name, duration) => step.sleep(name, duration),
});

const resumeOf = ({
  sessionId,
  videoId,
  startOffset,
  endOffset,
}: DriveImportPayload) =>
  sessionId && videoId && startOffset !== undefined && endOffset !== undefined
    ? { sessionId, videoId, startOffset, endOffset }
    : undefined;

const enqueueFollowUp = (
  { env, step, scope, job }: ImportContext,
  kind: "meta_video_status" | "tag_creative",
) =>
  step.do(`enqueue ${kind}`, JOB_STEP_CONFIG, () =>
    enqueueJob(env, {
      kind,
      key: job.creativeId,
      workspaceId: scope.workspaceId,
      payload: { creativeId: job.creativeId },
    }),
  );

const graphFor = ({ env, scope, job }: ImportContext) =>
  getGraphForAsset(env.DB, env, scope, job.adAccountAssetId);

async function importImage(context: ImportContext) {
  const { env, step, scope, job, creative } = context;
  const { graph, asset } = await graphFor(context);
  const readRange = driveRangeReader(env, scope, job.fileId);
  const image = await runMetaStep(
    withJobRetries(step),
    "upload image",
    async () =>
      uploadImage(
        graph,
        asset.metaId,
        creative.fileName,
        await readRange(0, creative.sizeBytes),
        creative.sizeBytes,
      ),
  );
  await step.do("mark ready", JOB_STEP_CONFIG, () =>
    markImportedImage(env.DB, scope, job.creativeId, image, now()),
  );
  await enqueueFollowUp(context, "tag_creative");
}

async function importVideo(context: ImportContext) {
  const { env, step, scope, job, creative } = context;
  const { graph, asset } = await graphFor(context);
  const { videoId, resume } = await runResumableUpload(withJobRetries(step), {
    ctx: { graph },
    actId: asset.metaId,
    fileSize: creative.sizeBytes,
    title: creative.fileName,
    readRange: driveRangeReader(env, scope, job.fileId),
    budget: new SubrequestBudget(),
    resume: resumeOf(job),
  });
  if (resume) {
    await step.do("continue in new job", JOB_STEP_CONFIG, () =>
      enqueueJob(env, {
        kind: "drive_import_file",
        key: `${job.creativeId}-${resume.startOffset}`,
        workspaceId: scope.workspaceId,
        payload: {
          creativeId: job.creativeId,
          fileId: job.fileId,
          adAccountAssetId: job.adAccountAssetId,
          ...resume,
        },
      }),
    );
    return;
  }
  await step.do("mark processing", JOB_STEP_CONFIG, () =>
    markImportedVideo(env.DB, scope, job.creativeId, videoId, now()),
  );
  await enqueueFollowUp(context, "meta_video_status");
}

async function recordFailure(
  { env, scope, job }: ImportContext,
  error: unknown,
) {
  const at = now();
  await markImportFailed(
    env.DB,
    scope,
    job.creativeId,
    driveFailureMessage(error),
    at,
  );
  if (needsGoogleReconnect(error)) {
    await markGoogleReconnectRequired(env.DB, scope, at);
  }
}

const canStillEdit = ({ creatorRole }: ImportingCreative) =>
  creatorRole !== null && ROLE_RANK[creatorRole] >= ROLE_RANK.editor;

async function importFile(context: ImportContext) {
  const { env, step, scope, job, creative } = context;
  if (scope.userId === JOB_USER_ID) {
    throw new NonRetryableError(DRIVE_RECONNECT);
  }
  if (!canStillEdit(creative)) {
    throw new NonRetryableError(DRIVE_CREATOR_REMOVED);
  }
  await step.do("verify drive file", JOB_STEP_CONFIG, () =>
    assertDriveFileMatches(env, scope, job.fileId, creative),
  );
  await (creative.kind === "video" ? importVideo : importImage)(context);
}

export const driveImportFileJob: JobHandler = async ({
  env,
  step,
  workspaceId,
  payload,
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!workspaceId || !parsed.success) {
    throw new NonRetryableError("Invalid drive_import_file job");
  }
  const job = parsed.data;
  const creative = await step.do("load creative", JOB_STEP_CONFIG, () =>
    findImportingCreative(
      env.DB,
      scopeFor(workspaceId, JOB_USER_ID),
      job.creativeId,
    ),
  );
  if (!creative) return;
  const context: ImportContext = {
    env,
    step,
    job,
    creative,
    scope: scopeFor(workspaceId, creative.createdBy ?? JOB_USER_ID),
  };
  try {
    await importFile(context);
  } catch (error) {
    await step.do("mark failed", JOB_STEP_CONFIG, () =>
      recordFailure(context, error),
    );
    if (!isUserFacingFailure(error)) throw error;
  }
};
