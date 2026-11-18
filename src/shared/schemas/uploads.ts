import { z } from "zod";
import { CREATIVE_KINDS } from "../constants";
import { type CreativeKind, creativeSchema } from "./creatives";

export const UPLOAD_CONTENT_TYPES = new Map<string, CreativeKind>([
  ["video/mp4", "video"],
  ["video/quicktime", "video"],
  ["video/x-m4v", "video"],
  ["image/jpeg", "image"],
  ["image/png", "image"],
]);

export const CHUNK_CONTENT_TYPE = "application/octet-stream";

const FILE_NAME_MAX = 255;
const CONTENT_TYPE_MAX = 100;

const dimension = z.int().positive().optional();

export const createUploadRequestSchema = z.object({
  adAccountAssetId: z.string().min(1).max(64),
  fileName: z.string().trim().min(1).max(FILE_NAME_MAX),
  contentType: z.string().trim().toLowerCase().max(CONTENT_TYPE_MAX),
  sizeBytes: z.int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: dimension,
  height: dimension,
  durationMs: dimension,
});
export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

export const chunkQuerySchema = z.object({
  start: z
    .string()
    .regex(/^\d{1,10}$/)
    .transform(Number),
});

export const nextChunkSchema = z
  .object({ start: z.int().nonnegative(), end: z.int().positive() })
  .nullable();
export type NextChunk = z.infer<typeof nextChunkSchema>;

export const createUploadResponseSchema = z.object({
  uploadId: z.string(),
  creativeId: z.string(),
  kind: z.enum(CREATIVE_KINDS),
  nextChunk: nextChunkSchema,
  duplicateOf: z.string().optional(),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const chunkResponseSchema = z.object({ nextChunk: nextChunkSchema });

export const completeUploadResponseSchema = z.object({
  creative: creativeSchema,
});
