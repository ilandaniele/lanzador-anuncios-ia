import { FILE_LIMITS } from "../../shared/constants";
import type { CreativeKind } from "../../shared/schemas/creatives";
import {
  CHUNK_CONTENT_TYPE,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type NextChunk,
  UPLOAD_CONTENT_TYPES,
} from "../../shared/schemas/uploads";
import type { Env } from "../env";
import {
  finishVideoUpload,
  startVideoUpload,
  transferVideoChunk,
  uploadImage,
} from "../integrations/meta/upload";
import { AppError, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { now } from "../lib/time";
import { findDuplicateCreativeId } from "../repositories/creatives";
import type { Scope } from "../repositories/scope";
import {
  advanceUpload,
  findUpload,
  insertUpload,
  markUploadAborted,
  markUploadCompleted,
  recordUploadedImage,
  type UploadOffsets,
  type UploadRow,
} from "../repositories/uploads";
import { toCreativeDto } from "./creatives";
import { enqueueJob } from "./jobs";
import { getGraphForAsset } from "./meta/connection";
import { rethrowMetaError } from "./meta/meta-error";

type UploadEnv = Pick<
  Env,
  | "DB"
  | "GRAPH_API_VERSION"
  | "JOB_WF"
  | "META_APP_SECRET"
  | "TOKEN_ENC_KEY_CURRENT"
>;

export interface ChunkBody {
  contentType?: string;
  contentLength?: string;
  body: ReadableStream<Uint8Array> | null;
}

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_FILE_BYTES: Record<CreativeKind, number> = {
  video: FILE_LIMITS.videoMaxBytes,
  image: FILE_LIMITS.imageMaxBytes,
};

const MAX_CHUNK_BYTES: Record<CreativeKind, number> = {
  video: FILE_LIMITS.chunkMaxBytes,
  image: FILE_LIMITS.imageMaxBytes,
};

function uploadKind(contentType: string): CreativeKind {
  const kind = UPLOAD_CONTENT_TYPES.get(contentType);
  if (!kind) throw new AppError(415, "UNSUPPORTED_TYPE");
  return kind;
}

export function allowedFileKind(
  contentType: string,
  sizeBytes: number,
): CreativeKind {
  const kind = uploadKind(contentType);
  if (sizeBytes > MAX_FILE_BYTES[kind]) {
    throw new AppError(413, "FILE_TOO_LARGE");
  }
  return kind;
}

const chunkEnd = (start: number, metaEnd: number) =>
  Math.min(metaEnd, start + FILE_LIMITS.chunkMaxBytes);

const toNextChunk = ({ startOffset, endOffset }: UploadOffsets): NextChunk =>
  startOffset < endOffset ? { start: startOffset, end: endOffset } : null;

const offsetMismatch = (upload: UploadOffsets) =>
  new AppError(409, "UPLOAD_OFFSET_MISMATCH", {
    details: { nextChunk: toNextChunk(upload) },
  });

async function activeUploadOrThrow(db: D1Database, scope: Scope, id: string) {
  const upload = await findUpload(db, scope, id);
  if (!upload) throw notFound();
  const expired =
    upload.status === "expired" ||
    (upload.status === "uploading" && upload.expiresAt <= now());
  if (expired) throw new AppError(410, "UPLOAD_EXPIRED");
  if (upload.status !== "uploading" || !upload.creativeId) {
    throw conflict("UPLOAD_NOT_ACTIVE");
  }
  return { ...upload, creativeId: upload.creativeId };
}

function chunkLength({ contentType, contentLength, body }: ChunkBody) {
  if (contentType?.toLowerCase() !== CHUNK_CONTENT_TYPE) {
    throw new AppError(415, "UNSUPPORTED_TYPE");
  }
  if (!body || !contentLength || !/^\d{1,10}$/.test(contentLength)) {
    throw new AppError(400, "VALIDATION", {
      fields: { "content-length": "invalid" },
    });
  }
  return Number(contentLength);
}

export async function createUpload(
  env: UploadEnv,
  scope: Scope,
  input: CreateUploadRequest,
): Promise<CreateUploadResponse> {
  const kind = allowedFileKind(input.contentType, input.sizeBytes);
  const [{ graph, asset }, duplicateOf] = await Promise.all([
    getGraphForAsset(env.DB, env, scope, input.adAccountAssetId),
    findDuplicateCreativeId(env.DB, scope, input.sha256),
  ]);
  const video =
    kind === "video"
      ? await startVideoUpload(graph, asset.metaId, input.sizeBytes).catch(
          rethrowMetaError,
        )
      : null;
  const offsets = video
    ? {
        startOffset: video.startOffset,
        endOffset: chunkEnd(video.startOffset, video.endOffset),
      }
    : { startOffset: 0, endOffset: input.sizeBytes };
  const at = now();
  const creativeId = newId();
  const uploadId = newId();
  await insertUpload(
    env.DB,
    scope,
    {
      id: creativeId,
      adAccountAssetId: asset.id,
      kind,
      originalFilename: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      metaVideoId: video?.videoId ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
      source: "browser",
      status: "uploading",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: uploadId,
      adAccountAssetId: asset.id,
      kind,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      metaUploadSessionId: video?.sessionId ?? null,
      ...offsets,
      expiresAt: at + UPLOAD_TTL_MS,
      createdAt: at,
    },
  );
  return {
    uploadId,
    creativeId,
    kind,
    nextChunk: toNextChunk(offsets),
    ...(duplicateOf ? { duplicateOf } : {}),
  };
}

async function sendChunk(
  env: UploadEnv,
  scope: Scope,
  upload: UploadRow,
  body: ReadableStream<Uint8Array>,
  bytes: number,
): Promise<UploadOffsets> {
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    upload.adAccountAssetId,
  );
  if (upload.kind === "image") {
    const image = await uploadImage(
      graph,
      asset.metaId,
      upload.fileName ?? upload.id,
      body,
      bytes,
    ).catch(rethrowMetaError);
    const offsets = {
      startOffset: upload.sizeBytes,
      endOffset: upload.sizeBytes,
    };
    const saved = await recordUploadedImage(
      env.DB,
      scope,
      upload,
      offsets,
      image,
      now(),
    );
    if (!saved) throw conflict("UPLOAD_NOT_ACTIVE");
    return offsets;
  }
  const meta = await transferVideoChunk(
    graph,
    asset.metaId,
    upload.metaUploadSessionId!,
    upload.startOffset,
    body,
    bytes,
  ).catch(rethrowMetaError);
  const offsets = {
    startOffset: meta.startOffset,
    endOffset: chunkEnd(meta.startOffset, meta.endOffset),
  };
  if (!(await advanceUpload(env.DB, scope, upload, offsets))) {
    throw conflict("UPLOAD_NOT_ACTIVE");
  }
  return offsets;
}

export async function uploadChunk(
  env: UploadEnv,
  scope: Scope,
  uploadId: string,
  start: number,
  chunk: ChunkBody,
): Promise<{ nextChunk: NextChunk }> {
  const upload = await activeUploadOrThrow(env.DB, scope, uploadId);
  const bytes = chunkLength(chunk);
  if (bytes > MAX_CHUNK_BYTES[upload.kind]) {
    throw new AppError(413, "CHUNK_TOO_LARGE");
  }
  const expected = upload.endOffset - upload.startOffset;
  if (start !== upload.startOffset || bytes !== expected) {
    throw offsetMismatch(upload);
  }
  const offsets = await sendChunk(env, scope, upload, chunk.body!, bytes);
  return { nextChunk: toNextChunk(offsets) };
}

export async function completeUpload(
  env: UploadEnv,
  scope: Scope,
  uploadId: string,
) {
  const upload = await activeUploadOrThrow(env.DB, scope, uploadId);
  if (toNextChunk(upload)) throw offsetMismatch(upload);
  if (upload.kind === "video") {
    const { graph, asset } = await getGraphForAsset(
      env.DB,
      env,
      scope,
      upload.adAccountAssetId,
    );
    await finishVideoUpload(
      graph,
      asset.metaId,
      upload.metaUploadSessionId!,
      upload.title ?? upload.id,
    ).catch(rethrowMetaError);
  }
  const creative = await markUploadCompleted(
    env.DB,
    scope,
    upload,
    upload.kind === "video" ? "processing" : "ready",
    now(),
  );
  if (!creative) throw conflict("UPLOAD_NOT_ACTIVE");
  if (upload.kind === "video") {
    await enqueueJob(env, {
      kind: "meta_video_status",
      key: creative.id,
      workspaceId: scope.workspaceId,
      payload: { creativeId: creative.id },
    });
  }
  return { creative: toCreativeDto(creative) };
}

export async function abortUpload(
  db: D1Database,
  scope: Scope,
  uploadId: string,
): Promise<void> {
  const status = await markUploadAborted(db, scope, uploadId);
  if (!status) throw notFound();
  if (status !== "aborted") throw conflict("UPLOAD_NOT_ACTIVE");
}
