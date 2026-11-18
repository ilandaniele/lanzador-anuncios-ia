import { FILE_LIMITS } from "../../../shared/constants";
import type {
  CreativeDto,
  CreativeKind,
} from "../../../shared/schemas/creatives";
import {
  CHUNK_CONTENT_TYPE,
  type CreateUploadResponse,
  type NextChunk,
  nextChunkSchema,
  UPLOAD_CONTENT_TYPES,
} from "../../../shared/schemas/uploads";
import { ApiError, apiFetch } from "../../lib/api";

const HASH_MAX_BYTES = 200 * 1024 * 1024;
const MAX_CHUNK_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const SHEET_CONTENT_TYPE = "image/jpeg";

const MAX_FILE_BYTES: Record<CreativeKind, number> = {
  video: FILE_LIMITS.videoMaxBytes,
  image: FILE_LIMITS.imageMaxBytes,
};

export type FileRejection = "type" | "empty" | "videoSize" | "imageSize";

export interface MediaMetadata {
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ChunkRetry {
  chunk: number;
  total: number;
}

export interface UploadParams {
  workspaceId: string;
  adAccountAssetId: string;
  file: File;
  signal: AbortSignal;
  metadata?: MediaMetadata;
  retryDelayMs?: number;
  onProgress?: (uploadedBytes: number) => void;
  onRetry?: (retry: ChunkRetry | null) => void;
}

export interface UploadResult {
  creative: CreativeDto;
  duplicateOf?: string;
}

export const uploadKind = (file: File): CreativeKind | undefined =>
  UPLOAD_CONTENT_TYPES.get(file.type.toLowerCase());

export function validateFile(file: File): FileRejection | null {
  const kind = uploadKind(file);
  if (!kind) return "type";
  if (file.size === 0) return "empty";
  if (file.size <= MAX_FILE_BYTES[kind]) return null;
  return kind === "video" ? "videoSize" : "imageSize";
}

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const digestHex = async (data: BufferSource) =>
  toHex(await crypto.subtle.digest("SHA-256", data));

export async function fileDigest(file: File): Promise<string> {
  if (file.size <= HASH_MAX_BYTES) return digestHex(await file.arrayBuffer());
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  return digestHex(new TextEncoder().encode(fingerprint));
}

const uploadsApi = (workspaceId: string) => `/api/w/${workspaceId}/uploads`;

export const abortUpload = (workspaceId: string, uploadId: string) =>
  apiFetch<void>(`${uploadsApi(workspaceId)}/${uploadId}/abort`, {
    method: "POST",
  });

const isRetryable = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500 || error.status === 429;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function resumePoint(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "UPLOAD_OFFSET_MISMATCH") {
    return undefined;
  }
  const parsed = nextChunkSchema.safeParse(error.details?.nextChunk);
  return parsed.success ? parsed : undefined;
}

async function sendWithRetry<T>(
  send: () => Promise<T>,
  { signal, retryDelayMs = DEFAULT_RETRY_DELAY_MS, onRetry }: UploadParams,
  describeRetry: () => ChunkRetry,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (
        signal.aborted ||
        !isRetryable(error) ||
        attempt > MAX_CHUNK_RETRIES
      ) {
        throw error;
      }
      onRetry?.(describeRetry());
      await sleep(retryDelayMs * attempt);
    }
  }
}

async function transferChunks(
  params: UploadParams,
  { uploadId, nextChunk }: CreateUploadResponse,
) {
  const { workspaceId, file, signal, onProgress, onRetry } = params;
  const totalChunks = Math.ceil(file.size / FILE_LIMITS.chunkMaxBytes);
  let next = nextChunk;
  let resyncs = 0;

  const sendChunk = async (chunk: NonNullable<NextChunk>) =>
    (
      await apiFetch<{ nextChunk: NextChunk }>(
        `${uploadsApi(workspaceId)}/${uploadId}/chunk?start=${chunk.start}`,
        {
          method: "PUT",
          signal,
          body: file.slice(chunk.start, chunk.end, CHUNK_CONTENT_TYPE),
        },
      )
    ).nextChunk;

  while (next) {
    const current = next;
    onProgress?.(current.start);
    try {
      next = await sendWithRetry(
        () => sendChunk(current),
        params,
        () => ({
          chunk: Math.floor(current.start / FILE_LIMITS.chunkMaxBytes) + 1,
          total: totalChunks,
        }),
      );
      resyncs = 0;
      onRetry?.(null);
    } catch (error) {
      const resumed = resumePoint(error);
      if (!resumed || ++resyncs > MAX_CHUNK_RETRIES) throw error;
      next = resumed.data;
    }
  }
  onProgress?.(file.size);
}

async function createUpload(params: UploadParams) {
  const { workspaceId, adAccountAssetId, file, signal, metadata } = params;
  return apiFetch<CreateUploadResponse>(uploadsApi(workspaceId), {
    method: "POST",
    signal,
    body: {
      adAccountAssetId,
      fileName: file.name,
      contentType: file.type.toLowerCase(),
      sizeBytes: file.size,
      sha256: await fileDigest(file),
      ...metadata,
    },
  });
}

export async function uploadFile(params: UploadParams): Promise<UploadResult> {
  const { workspaceId, signal } = params;
  const upload = await createUpload(params);
  try {
    await transferChunks(params, upload);
    const { creative } = await apiFetch<{ creative: CreativeDto }>(
      `${uploadsApi(workspaceId)}/${upload.uploadId}/complete`,
      { method: "POST", signal },
    );
    return { creative, duplicateOf: upload.duplicateOf };
  } catch (error) {
    await abortUpload(workspaceId, upload.uploadId).catch(() => undefined);
    throw error;
  }
}

export const sendContactSheet = (
  workspaceId: string,
  creativeId: string,
  sheet: Blob,
) =>
  apiFetch<unknown>(`/api/w/${workspaceId}/creatives/${creativeId}/tag`, {
    method: "POST",
    body: sheet.slice(0, sheet.size, SHEET_CONTENT_TYPE),
  });
