import { http, HttpResponse } from "msw";
import { FILE_LIMITS } from "../../../src/shared/constants";
import type {
  CreativeDto,
  CreativeStatus,
} from "../../../src/shared/schemas/creatives";
import type { NextChunk } from "../../../src/shared/schemas/uploads";
import type {
  DecodedMedia,
  MediaEnvironment,
} from "../../../src/web/features/uploads/contact-sheet";
import { server } from "../../helpers/msw/server";

export const MIB = 1024 * 1024;
export const WORKSPACE_ID = "w1";
export const ACCOUNT_ID = "acct1";

const API = `/api/w/${WORKSPACE_ID}`;

export const makeFile = (
  bytes: number,
  name = "anuncio.mp4",
  type = "video/mp4",
) => new File([new Uint8Array(bytes)], name, { type });

export const creativeDto = (status: CreativeStatus): CreativeDto => ({
  id: "c1",
  name: "anuncio",
  kind: "video",
  status,
  adAccountAssetId: ACCOUNT_ID,
  thumbnailUrl: null,
  formatWarning: null,
  tags: {
    hook: null,
    angle: null,
    format: null,
    language: null,
    onScreenText: null,
  },
  aiStatus: "pending",
  usedInLaunches: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const errorResponse = (
  status: number,
  code: string,
  details?: Record<string, unknown>,
) =>
  HttpResponse.json(
    { error: { code, message: code, requestId: "r1", details } },
    { status },
  );

const nextChunkAfter = (end: number, size: number): NextChunk =>
  end >= size
    ? null
    : { start: end, end: Math.min(size, end + FILE_LIMITS.chunkMaxBytes) };

export interface UploadBackendOptions {
  completeStatus?: CreativeStatus;
  statusPolls?: CreativeStatus[];
  failChunkStarts?: number[];
  rejectFirstChunkWith409?: boolean;
  holdChunks?: Promise<unknown>;
}

export interface Chunk {
  start: number;
  size: number;
  contentType: string | null;
}

export function installUploadBackend(options: UploadBackendOptions = {}) {
  const calls = {
    created: [] as Record<string, unknown>[],
    chunks: [] as Chunk[],
    completed: 0,
    aborted: 0,
    tagged: [] as { size: number; contentType: string | null }[],
    polls: 0,
  };
  const pendingFailures = [...(options.failChunkStarts ?? [])];
  let pending409 = options.rejectFirstChunkWith409 ?? false;
  let size = 0;

  server.use(
    http.post(`${API}/uploads`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.created.push(body);
      size = body.sizeBytes as number;
      return HttpResponse.json(
        {
          uploadId: "u1",
          creativeId: "c1",
          kind: "video",
          nextChunk: nextChunkAfter(0, size),
        },
        { status: 201 },
      );
    }),
    http.put(`${API}/uploads/u1/chunk`, async ({ request }) => {
      const start = Number(new URL(request.url).searchParams.get("start"));
      const bytes = (await request.arrayBuffer()).byteLength;
      calls.chunks.push({
        start,
        size: bytes,
        contentType: request.headers.get("content-type"),
      });
      await options.holdChunks;
      const failureIndex = pendingFailures.indexOf(start);
      if (failureIndex >= 0) {
        pendingFailures.splice(failureIndex, 1);
        return errorResponse(503, "INTERNAL");
      }
      if (pending409) {
        pending409 = false;
        return errorResponse(409, "UPLOAD_OFFSET_MISMATCH", {
          nextChunk: nextChunkAfter(FILE_LIMITS.chunkMaxBytes, size),
        });
      }
      return HttpResponse.json({
        nextChunk: nextChunkAfter(start + bytes, size),
      });
    }),
    http.post(`${API}/uploads/u1/complete`, () => {
      calls.completed += 1;
      return HttpResponse.json({
        creative: creativeDto(options.completeStatus ?? "processing"),
      });
    }),
    http.post(`${API}/uploads/u1/abort`, () => {
      calls.aborted += 1;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/creatives`, () => {
      const polls = options.statusPolls ?? ["ready"];
      const status = polls[Math.min(calls.polls, polls.length - 1)]!;
      calls.polls += 1;
      return HttpResponse.json({
        data: [creativeDto(status)],
        nextCursor: null,
      });
    }),
    http.post(`${API}/creatives/c1/tag`, async ({ request }) => {
      calls.tagged.push({
        size: (await request.arrayBuffer()).byteLength,
        contentType: request.headers.get("content-type"),
      });
      return HttpResponse.json({ tags: {} });
    }),
  );
  return calls;
}

export interface FakeMedia {
  environment: MediaEnvironment;
  frameTimes: number[];
  drawn: { width: number; height: number }[];
  canvases: { width: number; height: number }[];
  released: number;
}

export function fakeMedia(
  media: Partial<DecodedMedia> = {},
  sheetBytesByQuality: Record<number, number> = { 0.85: 200_000 },
): FakeMedia {
  const fake: FakeMedia = {
    frameTimes: [],
    drawn: [],
    canvases: [],
    released: 0,
    environment: {
      loadMedia: async () => ({
        width: 1920,
        height: 1080,
        durationMs: 10_000,
        frameAt: async (timeMs) => {
          fake.frameTimes.push(timeMs);
          return {} as CanvasImageSource;
        },
        release: () => {
          fake.released += 1;
        },
        ...media,
      }),
      createCanvas: (width, height) => {
        fake.canvases.push({ width, height });
        return {
          drawImage: (_source, _x, _y, w, h) =>
            fake.drawn.push({ width: w, height: h }),
          toJpeg: async (quality) =>
            new Blob([new Uint8Array(sheetBytesByQuality[quality] ?? 100)], {
              type: "image/jpeg",
            }),
        };
      },
    },
  };
  return fake;
}
