import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FILE_LIMITS } from "../../src/shared/constants";
import { buildContactSheet } from "../../src/web/features/uploads/contact-sheet";
import {
  abortUpload,
  fileDigest,
  sendContactSheet,
  uploadFile,
  validateFile,
  type UploadParams,
} from "../../src/web/features/uploads/upload-client";
import { ApiError } from "../../src/web/lib/api";
import { server } from "../helpers/msw/server";
import {
  ACCOUNT_ID,
  fakeMedia,
  installUploadBackend,
  makeFile,
  MIB,
  WORKSPACE_ID,
  type UploadBackendOptions,
} from "./helpers/upload-fakes";

beforeAll(() => server.enable());
afterAll(() => server.disable());

const OCTET_STREAM = "application/octet-stream";

const params = (
  file: File,
  overrides: Partial<UploadParams> = {},
): UploadParams => ({
  workspaceId: WORKSPACE_ID,
  adAccountAssetId: ACCOUNT_ID,
  file,
  signal: new AbortController().signal,
  retryDelayMs: 0,
  ...overrides,
});

function upload25MiB(
  options?: UploadBackendOptions,
  overrides?: Partial<UploadParams>,
) {
  const calls = installUploadBackend(options);
  const result = uploadFile(params(makeFile(25 * MIB), overrides));
  return { calls, result };
}

const oversized = (file: File, bytes: number) =>
  Object.defineProperty(file, "size", { value: bytes });

describe("uploadFile", () => {
  it("uploads 25 MiB in chunks of 10, 10 and 5 MiB following nextChunk", async () => {
    const onProgress = vi.fn();
    const { calls, result } = upload25MiB(undefined, {
      onProgress,
      metadata: { width: 1920, height: 1080, durationMs: 10_000 },
    });

    const { creative } = await result;

    expect(calls.chunks).toEqual([
      { start: 0, size: 10 * MIB, contentType: OCTET_STREAM },
      { start: 10 * MIB, size: 10 * MIB, contentType: OCTET_STREAM },
      { start: 20 * MIB, size: 5 * MIB, contentType: OCTET_STREAM },
    ]);
    expect(calls.completed).toBe(1);
    expect(creative.status).toBe("processing");
    expect(calls.created[0]).toMatchObject({
      adAccountAssetId: ACCOUNT_ID,
      fileName: "anuncio.mp4",
      contentType: "video/mp4",
      sizeBytes: 25 * MIB,
      width: 1920,
      durationMs: 10_000,
    });
    expect(calls.created[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(onProgress).toHaveBeenLastCalledWith(25 * MIB);
  });

  it("retries a chunk that fails once", async () => {
    const onRetry = vi.fn();
    const { calls, result } = upload25MiB(
      { failChunkStarts: [10 * MIB] },
      { onRetry },
    );

    await result;

    expect(calls.chunks.map((chunk) => chunk.start)).toEqual([
      0,
      10 * MIB,
      10 * MIB,
      20 * MIB,
    ]);
    expect(onRetry).toHaveBeenCalledWith({ chunk: 2, total: 3 });
    expect(onRetry).toHaveBeenLastCalledWith(null);
    expect(calls.aborted).toBe(0);
  });

  it("gives up after 3 retries of the same chunk and aborts the upload", async () => {
    const { calls, result } = upload25MiB({ failChunkStarts: [0, 0, 0, 0] });

    await expect(result).rejects.toBeInstanceOf(ApiError);

    expect(calls.chunks).toHaveLength(4);
    expect(calls.aborted).toBe(1);
  });

  it("resumes from the nextChunk carried by a 409", async () => {
    const { calls, result } = upload25MiB({ rejectFirstChunkWith409: true });

    await result;

    expect(calls.chunks.map((chunk) => chunk.start)).toEqual([
      0,
      10 * MIB,
      20 * MIB,
    ]);
    expect(calls.completed).toBe(1);
  });

  it("calls abort when cancelled mid-upload", async () => {
    const controller = new AbortController();
    const { calls, result } = upload25MiB(undefined, {
      signal: controller.signal,
      onProgress: (uploaded) => {
        if (uploaded === 10 * MIB) controller.abort();
      },
    });

    await expect(result).rejects.toThrow();

    expect(calls.chunks).toHaveLength(1);
    expect(calls.completed).toBe(0);
    expect(calls.aborted).toBe(1);
  });

  it("exposes abortUpload as a plain POST", async () => {
    const calls = installUploadBackend();

    await abortUpload(WORKSPACE_ID, "u1");

    expect(calls.aborted).toBe(1);
  });
});

describe("contact sheet", () => {
  it("draws 3 video frames and re-encodes until it weighs at most 1 MB", async () => {
    const media = fakeMedia({}, { 0.85: 1_500_000, 0.7: 900_000 });
    const decoded = await media.environment.loadMedia(makeFile(1), "video");

    const sheet = await buildContactSheet(decoded, "video", media.environment);

    expect(media.frameTimes).toEqual([2000, 5000, 8000]);
    expect(media.canvases).toEqual([{ width: 1200, height: 225 }]);
    expect(media.drawn).toHaveLength(3);
    expect(sheet.size).toBe(900_000);
    expect(sheet.size).toBeLessThanOrEqual(FILE_LIMITS.contactSheetMaxBytes);
  });

  it("downscales an image into a single cell", async () => {
    const media = fakeMedia({ width: 4000, height: 2000, durationMs: null });
    const decoded = await media.environment.loadMedia(makeFile(1), "image");

    await buildContactSheet(decoded, "image", media.environment);

    expect(media.canvases).toEqual([{ width: 1024, height: 512 }]);
    expect(media.drawn).toHaveLength(1);
  });

  it("fails when no quality fits in 1 MB", async () => {
    const tooBig = 2_000_000;
    const media = fakeMedia(
      {},
      { 0.85: tooBig, 0.7: tooBig, 0.55: tooBig, 0.4: tooBig, 0.25: tooBig },
    );
    const decoded = await media.environment.loadMedia(makeFile(1), "video");

    await expect(
      buildContactSheet(decoded, "video", media.environment),
    ).rejects.toThrow("CONTACT_SHEET_TOO_LARGE");
  });

  it("sends the sheet to /tag as image/jpeg", async () => {
    const calls = installUploadBackend();
    const media = fakeMedia({}, { 0.85: 600_000 });
    const decoded = await media.environment.loadMedia(makeFile(1), "video");
    const sheet = await buildContactSheet(decoded, "video", media.environment);

    await sendContactSheet(WORKSPACE_ID, "c1", sheet);

    expect(calls.tagged).toEqual([
      { size: 600_000, contentType: "image/jpeg" },
    ]);
    expect(calls.tagged[0]!.size).toBeLessThanOrEqual(
      FILE_LIMITS.contactSheetMaxBytes,
    );
  });
});

describe("validateFile", () => {
  it("accepts supported types within the size limit", () => {
    expect(validateFile(makeFile(1))).toBeNull();
    expect(validateFile(makeFile(1, "a.png", "image/png"))).toBeNull();
  });

  it("rejects unsupported types and empty files", () => {
    expect(validateFile(makeFile(1, "tienda.pdf", "application/pdf"))).toBe(
      "type",
    );
    expect(validateFile(makeFile(0))).toBe("empty");
  });

  it("rejects videos over 500 MB and images over 30 MB", () => {
    expect(validateFile(oversized(makeFile(1), 500 * MIB + 1))).toBe(
      "videoSize",
    );
    expect(validateFile(oversized(makeFile(1), 500 * MIB))).toBeNull();
    expect(
      validateFile(oversized(makeFile(1, "a.jpg", "image/jpeg"), 30 * MIB + 1)),
    ).toBe("imageSize");
  });
});

describe("fileDigest", () => {
  it("hashes the content with sha256", async () => {
    const file = new File(["abc"], "a.png", { type: "image/png" });

    expect(await fileDigest(file)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("does not read files over 200 MB", async () => {
    const file = oversized(makeFile(1), 201 * MIB);
    const read = vi.spyOn(file, "arrayBuffer");

    expect(await fileDigest(file)).toMatch(/^[a-f0-9]{64}$/);
    expect(read).not.toHaveBeenCalled();
  });
});
