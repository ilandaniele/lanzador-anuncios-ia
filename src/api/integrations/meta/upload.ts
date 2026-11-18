import { z } from "zod";
import type { Graph } from "./client";
import { invalidPayloadError } from "./errors";

export type VideoStatus = "processing" | "ready" | "error";

export interface VideoSession {
  sessionId: string;
  videoId: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkOffsets {
  startOffset: number;
  endOffset: number;
}

const OCTET_STREAM = "application/octet-stream";

const offsetSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
]);

const offsetFields = { start_offset: offsetSchema, end_offset: offsetSchema };

const offsetsSchema = z.object(offsetFields);

const sessionSchema = z.object({
  ...offsetFields,
  upload_session_id: z.string(),
  video_id: z.string(),
});

const finishedSchema = z.object({ success: z.literal(true) });

const imagesSchema = z.object({
  images: z.record(z.string(), z.object({ hash: z.string(), url: z.string() })),
});

const videoStatusSchema = z.object({
  status: z.object({ video_status: z.string() }),
  format: z
    .array(z.object({ width: z.number(), height: z.number() }))
    .optional(),
});

const thumbnailsSchema = z.object({
  data: z.array(
    z.object({ uri: z.string(), is_preferred: z.boolean().optional() }),
  ),
});

const toOffsets = ({
  start_offset,
  end_offset,
}: z.infer<typeof offsetsSchema>): ChunkOffsets => ({
  startOffset: start_offset,
  endOffset: end_offset,
});

export function parse<S extends z.ZodType>(
  schema: S,
  payload: unknown,
): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

const advideos = (actId: string) => `${actId}/advideos`;

export async function startVideoUpload(
  graph: Graph,
  actId: string,
  fileSize: number,
): Promise<VideoSession> {
  const reply = await graph.post<unknown>(
    advideos(actId),
    { upload_phase: "start", file_size: fileSize },
    "video",
  );
  const session = parse(sessionSchema, reply);
  return {
    sessionId: session.upload_session_id,
    videoId: session.video_id,
    ...toOffsets(session),
  };
}

export async function transferVideoChunk(
  graph: Graph,
  actId: string,
  sessionId: string,
  startOffset: number,
  body: ReadableStream,
  bytes: number,
): Promise<ChunkOffsets> {
  const reply = await graph.upload<unknown>(
    advideos(actId),
    {
      upload_phase: "transfer",
      upload_session_id: sessionId,
      start_offset: startOffset,
    },
    {
      fieldName: "video_file_chunk",
      fileName: "video_file_chunk",
      contentType: OCTET_STREAM,
      body,
      bytes,
    },
    "video",
  );
  return toOffsets(parse(offsetsSchema, reply));
}

export async function finishVideoUpload(
  graph: Graph,
  actId: string,
  sessionId: string,
  title: string,
): Promise<void> {
  const reply = await graph.post<unknown>(
    advideos(actId),
    { upload_phase: "finish", upload_session_id: sessionId, title },
    "video",
  );
  parse(finishedSchema, reply);
}

export async function uploadImage(
  graph: Graph,
  actId: string,
  fileName: string,
  body: ReadableStream,
  bytes: number,
): Promise<{ hash: string; url: string }> {
  const reply = await graph.upload<unknown>(
    `${actId}/adimages`,
    {},
    { fieldName: "filename", fileName, contentType: OCTET_STREAM, body, bytes },
  );
  const [image] = Object.values(parse(imagesSchema, reply).images);
  if (!image) throw invalidPayloadError();
  return image;
}

const toVideoStatus = (videoStatus: string): VideoStatus =>
  videoStatus === "ready" || videoStatus === "error"
    ? videoStatus
    : "processing";

export async function readVideoStatus(
  graph: Graph,
  videoId: string,
): Promise<{ status: VideoStatus; width?: number; height?: number }> {
  const reply = await graph.get<unknown>(videoId, { fields: "status,format" });
  const { status, format = [] } = parse(videoStatusSchema, reply);
  const largest = format.reduce<(typeof format)[number] | undefined>(
    (best, rendition) =>
      !best || rendition.width * rendition.height > best.width * best.height
        ? rendition
        : best,
    undefined,
  );
  return {
    status: toVideoStatus(status.video_status),
    ...(largest && { width: largest.width, height: largest.height }),
  };
}

export async function readVideoThumbnail(
  graph: Graph,
  videoId: string,
): Promise<string | null> {
  const reply = await graph.get<unknown>(`${videoId}/thumbnails`);
  const { data } = parse(thumbnailsSchema, reply);
  return (
    (data.find((thumbnail) => thumbnail.is_preferred) ?? data[0])?.uri ?? null
  );
}
