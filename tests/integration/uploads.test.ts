import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { jobInstanceId } from "../../src/api/services/jobs";
import { creatives, uploads } from "../../src/db/schema/creatives";
import { metaConnections } from "../../src/db/schema/meta";
import { FILE_LIMITS } from "../../src/shared/constants";
import {
  chunkResponseSchema,
  completeUploadResponseSchema,
  createUploadResponseSchema,
} from "../../src/shared/schemas/uploads";
import {
  api,
  createCreative,
  createMetaAsset,
  createMetaConnection,
  createUpload,
  createWorkspace,
  expectError,
  loginAs,
} from "../helpers/factory";
import { captureRequests } from "../helpers/meta-graph";
import {
  GRAPH_VERSION,
  graphUrl,
  graphVideoUrl,
  metaFails,
  metaReplies,
  metaVideoPhases,
} from "../helpers/msw/meta";
import { server } from "../helpers/msw/server";
import {
  openLimiter,
  readEnvelope,
  testEnv,
  trustedHeaders,
} from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABuploadsRouteToken321";
const SESSION = "upload_session_41";
const SHA = "a".repeat(64);
const MIB = 1024 * 1024;

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const routeEnv = {
  ...keyEnv,
  GRAPH_API_VERSION: GRAPH_VERSION,
  META_APP_SECRET: "test-app-secret",
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_UPL: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: routeEnv, ...options });

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { wid: workspace.id, owner, asset, connection };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const uploadsPath = (wid: string) => `/api/w/${wid}/uploads`;
const uploadPath = (wid: string, uploadId: string, action: string) =>
  `/api/w/${wid}/uploads/${uploadId}/${action}`;

const uploadRequest = (assetId: string, overrides = {}) => ({
  adAccountAssetId: assetId,
  fileName: "foto.png",
  contentType: "image/png",
  sizeBytes: 2048,
  sha256: SHA,
  ...overrides,
});

const videoRequest = (assetId: string, overrides = {}) =>
  uploadRequest(assetId, {
    fileName: "video.mp4",
    contentType: "video/mp4",
    sizeBytes: 25 * MIB,
    ...overrides,
  });

const bytesOf = (size: number) =>
  Uint8Array.from({ length: size }, (_, index) => index % 256);

async function putChunk(
  { wid, owner }: Pick<Setup, "wid" | "owner">,
  uploadId: string,
  start: number,
  bytes: Uint8Array,
  headers: Record<string, string> = {},
) {
  const { cookie } = await loginAs(owner);
  return app.request(
    `${uploadPath(wid, uploadId, "chunk")}?start=${start}`,
    {
      method: "PUT",
      headers: {
        ...trustedHeaders,
        Cookie: cookie,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
        ...headers,
      },
      body: bytes,
    },
    testEnv(routeEnv),
  );
}

const findCreative = async (id: string) =>
  (await db.select().from(creatives).where(eq(creatives.id, id)))[0];

const findUploadRow = async (id: string) =>
  (await db.select().from(uploads).where(eq(uploads.id, id)))[0];

const videoStart = (endOffset: number) => ({
  start: {
    upload_session_id: SESSION,
    video_id: "vid_41",
    start_offset: "0",
    end_offset: String(endOffset),
  },
});

const createVideoUpload = (
  { wid, asset }: Pick<Setup, "wid" | "asset">,
  overrides = {},
) =>
  createUpload(wid, asset.id, {
    kind: "video",
    sizeBytes: 25 * MIB,
    metaUploadSessionId: SESSION,
    startOffset: 0,
    endOffset: 10 * MIB,
    ...overrides,
  });

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/uploads", () => {
  it("creates an image upload with the whole file as one chunk, without Meta", async () => {
    const { wid, owner, asset } = await setup();
    const requests = captureRequests();

    const response = await call(uploadsPath(wid), {
      as: owner,
      method: "POST",
      body: uploadRequest(asset.id, { width: 1080, height: 1350 }),
    });

    expect(response.status).toBe(201);
    const body = createUploadResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      kind: "image",
      nextChunk: { start: 0, end: 2048 },
    });
    expect(body.duplicateOf).toBeUndefined();
    expect(requests).toHaveLength(0);
    expect(await findCreative(body.creativeId)).toMatchObject({
      workspaceId: wid,
      adAccountAssetId: asset.id,
      status: "uploading",
      source: "browser",
      originalFilename: "foto.png",
      width: 1080,
      createdBy: owner.id,
    });
    expect(await findUploadRow(body.uploadId)).toMatchObject({
      creativeId: body.creativeId,
      status: "uploading",
      startOffset: 0,
      endOffset: 2048,
    });
  });

  it("opens a Meta video session and caps the first chunk at 10 MiB", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaVideoPhases(`${asset.metaId}/advideos`, videoStart(20 * MIB)),
    );
    const requests = captureRequests();

    const response = await call(uploadsPath(wid), {
      as: owner,
      method: "POST",
      body: videoRequest(asset.id),
    });

    expect(response.status).toBe(201);
    const body = createUploadResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      kind: "video",
      nextChunk: { start: 0, end: 10 * MIB },
    });
    const form = await requests[0]!.formData();
    expect(form.get("upload_phase")).toBe("start");
    expect(form.get("file_size")).toBe(String(25 * MIB));
    expect(await findUploadRow(body.uploadId)).toMatchObject({
      metaUploadSessionId: SESSION,
      endOffset: 10 * MIB,
    });
    expect((await findCreative(body.creativeId))?.metaVideoId).toBe("vid_41");
  });

  it("flags a duplicate by sha256 in the workspace", async () => {
    const { wid, owner, asset } = await setup();
    const existing = await createCreative(wid, asset.id, { sha256: SHA });

    const response = await call(uploadsPath(wid), {
      as: owner,
      method: "POST",
      body: uploadRequest(asset.id),
    });

    expect(
      createUploadResponseSchema.parse(await response.json()).duplicateOf,
    ).toBe(existing.id);
  });

  it("ignores a same-sha creative of another workspace", async () => {
    const { wid, owner, asset } = await setup();
    const other = await setup();
    await createCreative(other.wid, other.asset.id, { sha256: SHA });

    const response = await call(uploadsPath(wid), {
      as: owner,
      method: "POST",
      body: uploadRequest(asset.id),
    });

    expect(
      createUploadResponseSchema.parse(await response.json()).duplicateOf,
    ).toBeUndefined();
  });

  it("returns 415 UNSUPPORTED_TYPE outside the allow-list", async () => {
    const { wid, owner, asset } = await setup();

    for (const contentType of ["application/pdf", "image/gif", "constructor"]) {
      await expectError(
        await call(uploadsPath(wid), {
          as: owner,
          method: "POST",
          body: uploadRequest(asset.id, { contentType }),
        }),
        415,
        "UNSUPPORTED_TYPE",
      );
    }
  });

  it("returns 413 FILE_TOO_LARGE past 30 MB for images and 500 MB for videos", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(uploadsPath(wid), {
        as: owner,
        method: "POST",
        body: uploadRequest(asset.id, {
          sizeBytes: FILE_LIMITS.imageMaxBytes + 1,
        }),
      }),
      413,
      "FILE_TOO_LARGE",
    );
    await expectError(
      await call(uploadsPath(wid), {
        as: owner,
        method: "POST",
        body: videoRequest(asset.id, {
          sizeBytes: FILE_LIMITS.videoMaxBytes + 1,
        }),
      }),
      413,
      "FILE_TOO_LARGE",
    );
  });

  it("returns 400 for a malformed sha256 or size", async () => {
    const { wid, owner, asset } = await setup();

    for (const overrides of [
      { sha256: "abc" },
      { sha256: "A".repeat(64) },
      { sizeBytes: 0 },
      { sizeBytes: 1.5 },
    ]) {
      await expectError(
        await call(uploadsPath(wid), {
          as: owner,
          method: "POST",
          body: uploadRequest(asset.id, overrides),
        }),
        400,
        "VALIDATION",
      );
    }
  });

  it("returns 404 for an ad account of another workspace, without Meta or rows", async () => {
    const { wid, owner } = await setup();
    const other = await setup();
    const requests = captureRequests();

    await expectError(
      await call(uploadsPath(wid), {
        as: owner,
        method: "POST",
        body: videoRequest(other.asset.id),
      }),
      404,
      "NOT_FOUND",
    );
    expect(requests).toHaveLength(0);
    const rows = await db
      .select()
      .from(uploads)
      .where(eq(uploads.workspaceId, wid));
    expect(rows).toHaveLength(0);
  });

  it("returns 409 META_RECONNECT_REQUIRED for an inactive connection", async () => {
    const { wid, owner, asset, connection } = await setup();
    await db
      .update(metaConnections)
      .set({ status: "reconnect_required" })
      .where(eq(metaConnections.id, connection.id));

    await expectError(
      await call(uploadsPath(wid), {
        as: owner,
        method: "POST",
        body: uploadRequest(asset.id),
      }),
      409,
      "META_RECONNECT_REQUIRED",
    );
  });

  it("returns 502 META_ERROR when Meta rejects the video session", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaVideoPhases(
        `${asset.metaId}/advideos`,
        { start: { error: { code: 100, message: "bad" } } },
        400,
      ),
    );

    await expectError(
      await call(uploadsPath(wid), {
        as: owner,
        method: "POST",
        body: videoRequest(asset.id),
      }),
      502,
      "META_ERROR",
    );
  });
});

describe("PUT /api/w/:wid/uploads/:uploadId/chunk", () => {
  it("uploads an image in one chunk and stores the Meta hash", async () => {
    const ctx = await setup();
    const { creative, upload } = await createUpload(ctx.wid, ctx.asset.id, {
      sizeBytes: 2048,
    });
    server.use(
      metaReplies(`${ctx.asset.metaId}/adimages`, {
        images: {
          [creative.originalFilename]: {
            hash: "img_hash_41",
            url: "https://scontent.fbcdn.net/i41.png",
          },
        },
      }),
    );
    const requests = captureRequests();

    const response = await putChunk(ctx, upload.id, 0, bytesOf(2048));

    expect(response.status).toBe(200);
    expect(chunkResponseSchema.parse(await response.json())).toEqual({
      nextChunk: null,
    });
    expect(
      requests[0]!.url.startsWith(graphUrl(`${ctx.asset.metaId}/adimages`)),
    ).toBe(true);
    const file = (await requests[0]!.formData()).get("filename") as File;
    expect(file.size).toBe(2048);
    expect(await findCreative(creative.id)).toMatchObject({
      metaImageHash: "img_hash_41",
      thumbnailUrl: "https://scontent.fbcdn.net/i41.png",
      status: "uploading",
    });
  });

  it("forwards a video chunk with the session and offset and returns Meta's next range", async () => {
    const ctx = await setup();
    const { upload } = await createVideoUpload(ctx, {
      sizeBytes: 3000,
      endOffset: 1000,
    });
    server.use(
      metaVideoPhases(`${ctx.asset.metaId}/advideos`, {
        transfer: { start_offset: "1000", end_offset: "3000" },
      }),
    );
    const requests = captureRequests();

    const response = await putChunk(ctx, upload.id, 0, bytesOf(1000));

    expect(chunkResponseSchema.parse(await response.json())).toEqual({
      nextChunk: { start: 1000, end: 3000 },
    });
    expect(
      requests[0]!.url.startsWith(
        graphVideoUrl(`${ctx.asset.metaId}/advideos`),
      ),
    ).toBe(true);
    const form = await requests[0]!.formData();
    expect(form.get("upload_phase")).toBe("transfer");
    expect(form.get("upload_session_id")).toBe(SESSION);
    expect(form.get("start_offset")).toBe("0");
    expect((form.get("video_file_chunk") as File).size).toBe(1000);
    expect(await findUploadRow(upload.id)).toMatchObject({
      startOffset: 1000,
      endOffset: 3000,
    });
  });

  it("caps Meta's next range at 10 MiB", async () => {
    const ctx = await setup();
    const { upload } = await createVideoUpload(ctx, {
      sizeBytes: 100 * MIB,
      endOffset: 1000,
    });
    server.use(
      metaVideoPhases(`${ctx.asset.metaId}/advideos`, {
        transfer: { start_offset: "1000", end_offset: String(60 * MIB) },
      }),
    );

    const response = await putChunk(ctx, upload.id, 0, bytesOf(1000));

    expect(chunkResponseSchema.parse(await response.json())).toEqual({
      nextChunk: { start: 1000, end: 1000 + 10 * MIB },
    });
  });

  it("returns 413 CHUNK_TOO_LARGE with Content-Length over 10 MiB, without Meta", async () => {
    const ctx = await setup();
    const { upload } = await createVideoUpload(ctx, {
      endOffset: 10 * MIB + 1,
    });
    const requests = captureRequests();

    await expectError(
      await putChunk(ctx, upload.id, 0, new Uint8Array(10 * MIB + 1)),
      413,
      "CHUNK_TOO_LARGE",
    );
    expect(requests).toHaveLength(0);
  });

  it("returns 409 UPLOAD_OFFSET_MISMATCH with the expected nextChunk", async () => {
    const ctx = await setup();
    const { upload } = await createVideoUpload(ctx, {
      startOffset: 1000,
      endOffset: 2000,
    });

    const wrongStart = await putChunk(ctx, upload.id, 0, bytesOf(1000));
    expect(wrongStart.status).toBe(409);
    expect(await readEnvelope(wrongStart)).toMatchObject({
      code: "UPLOAD_OFFSET_MISMATCH",
      details: { nextChunk: { start: 1000, end: 2000 } },
    });

    const wrongLength = await putChunk(ctx, upload.id, 1000, bytesOf(500));
    expect(await readEnvelope(wrongLength)).toMatchObject({
      code: "UPLOAD_OFFSET_MISMATCH",
      details: { nextChunk: { start: 1000, end: 2000 } },
    });
  });

  it("returns 410 UPLOAD_EXPIRED after 24 h", async () => {
    const ctx = await setup();
    const { upload } = await createUpload(ctx.wid, ctx.asset.id, {
      expiresAt: Date.now() - 1,
    });

    await expectError(
      await putChunk(ctx, upload.id, 0, bytesOf(1024)),
      410,
      "UPLOAD_EXPIRED",
    );
  });

  it("returns 409 UPLOAD_NOT_ACTIVE for a completed upload", async () => {
    const ctx = await setup();
    const { upload } = await createUpload(ctx.wid, ctx.asset.id, {
      status: "completed",
    });

    await expectError(
      await putChunk(ctx, upload.id, 0, bytesOf(1024)),
      409,
      "UPLOAD_NOT_ACTIVE",
    );
  });

  it("returns 415 for a body that is not application/octet-stream", async () => {
    const ctx = await setup();
    const { upload } = await createUpload(ctx.wid, ctx.asset.id);

    await expectError(
      await putChunk(ctx, upload.id, 0, bytesOf(1024), {
        "Content-Type": "multipart/form-data",
      }),
      415,
      "UNSUPPORTED_TYPE",
    );
  });

  it("returns 400 for a missing or malformed start", async () => {
    const ctx = await setup();
    const { upload } = await createUpload(ctx.wid, ctx.asset.id);
    const { cookie } = await loginAs(ctx.owner);

    const response = await app.request(
      `${uploadPath(ctx.wid, upload.id, "chunk")}?start=-1`,
      {
        method: "PUT",
        headers: { ...trustedHeaders, Cookie: cookie },
        body: bytesOf(10),
      },
      testEnv(routeEnv),
    );

    await expectError(response, 400, "VALIDATION");
  });

  it("returns 502 META_ERROR and keeps the offset when Meta fails", async () => {
    const ctx = await setup();
    const { upload } = await createUpload(ctx.wid, ctx.asset.id);
    server.use(
      metaFails(`${ctx.asset.metaId}/adimages`, {
        error: { code: 100, message: "bad image" },
      }),
    );

    await expectError(
      await putChunk(ctx, upload.id, 0, bytesOf(1024)),
      502,
      "META_ERROR",
    );
    expect((await findUploadRow(upload.id))?.startOffset).toBe(0);
  });
});

describe("POST /api/w/:wid/uploads/:uploadId/complete", () => {
  it("finishes an image after its chunk and leaves it ready with meta_image_hash", async () => {
    const ctx = await setup();
    const created = createUploadResponseSchema.parse(
      await (
        await call(uploadsPath(ctx.wid), {
          as: ctx.owner,
          method: "POST",
          body: uploadRequest(ctx.asset.id, { sizeBytes: 512 }),
        })
      ).json(),
    );
    server.use(
      metaReplies(`${ctx.asset.metaId}/adimages`, {
        images: {
          "foto.png": {
            hash: "img_hash_ready",
            url: "https://scontent.fbcdn.net/r.png",
          },
        },
      }),
    );
    await putChunk(ctx, created.uploadId, 0, bytesOf(512));

    const response = await call(
      uploadPath(ctx.wid, created.uploadId, "complete"),
      {
        as: ctx.owner,
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    expect(
      completeUploadResponseSchema.parse(await response.json()).creative,
    ).toMatchObject({
      id: created.creativeId,
      name: "foto.png",
      kind: "image",
      status: "ready",
      thumbnailUrl: "https://scontent.fbcdn.net/r.png",
      usedInLaunches: 0,
    });
    expect((await findCreative(created.creativeId))?.metaImageHash).toBe(
      "img_hash_ready",
    );
    expect((await findUploadRow(created.uploadId))?.status).toBe("completed");
  });

  it("finishes a video in Meta, leaves it processing and enqueues meta_video_status", async () => {
    const ctx = await setup();
    const { creative, upload } = await createVideoUpload(ctx, {
      startOffset: 25 * MIB,
      endOffset: 25 * MIB,
    });
    await db
      .update(creatives)
      .set({ metaVideoId: "vid_42" })
      .where(eq(creatives.id, creative.id));
    server.use(
      metaVideoPhases(`${ctx.asset.metaId}/advideos`, {
        finish: { success: true },
      }),
      metaReplies("vid_42", { status: { video_status: "ready" } }),
      metaReplies("vid_42/thumbnails", {
        data: [{ uri: "https://scontent.fbcdn.net/v.jpg" }],
      }),
    );
    const requests = captureRequests();
    await using instance = await introspectWorkflowInstance(
      env.JOB_WF!,
      jobInstanceId({ kind: "meta_video_status", key: creative.id }),
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
    });

    const response = await call(uploadPath(ctx.wid, upload.id, "complete"), {
      as: ctx.owner,
      method: "POST",
    });

    expect(
      completeUploadResponseSchema.parse(await response.json()).creative,
    ).toMatchObject({ id: creative.id, kind: "video", status: "processing" });
    await instance.waitForStatus("complete");
    expect(await findCreative(creative.id)).toMatchObject({
      status: "ready",
      thumbnailUrl: "https://scontent.fbcdn.net/v.jpg",
    });
    const form = await requests[0]!.formData();
    expect(form.get("upload_phase")).toBe("finish");
    expect(form.get("upload_session_id")).toBe(SESSION);
    expect(form.get("title")).toBe(creative.originalFilename);
    expect((await findUploadRow(upload.id))?.status).toBe("completed");
  });

  it("returns 409 UPLOAD_OFFSET_MISMATCH while bytes are pending", async () => {
    const ctx = await setup();
    const { upload } = await createUpload(ctx.wid, ctx.asset.id);

    const response = await call(uploadPath(ctx.wid, upload.id, "complete"), {
      as: ctx.owner,
      method: "POST",
    });

    expect(await readEnvelope(response)).toMatchObject({
      code: "UPLOAD_OFFSET_MISMATCH",
      details: { nextChunk: { start: 0, end: 1024 } },
    });
  });

  it("returns 410 UPLOAD_EXPIRED and 409 UPLOAD_NOT_ACTIVE", async () => {
    const ctx = await setup();
    const expired = await createUpload(ctx.wid, ctx.asset.id, {
      status: "expired",
    });
    const aborted = await createUpload(ctx.wid, ctx.asset.id, {
      status: "aborted",
    });

    await expectError(
      await call(uploadPath(ctx.wid, expired.upload.id, "complete"), {
        as: ctx.owner,
        method: "POST",
      }),
      410,
      "UPLOAD_EXPIRED",
    );
    await expectError(
      await call(uploadPath(ctx.wid, aborted.upload.id, "complete"), {
        as: ctx.owner,
        method: "POST",
      }),
      409,
      "UPLOAD_NOT_ACTIVE",
    );
  });
});

describe("POST /api/w/:wid/uploads/:uploadId/abort", () => {
  it("deletes the creative and leaves the upload aborted, idempotently", async () => {
    const ctx = await setup();
    const { creative, upload } = await createUpload(ctx.wid, ctx.asset.id);
    const abort = () =>
      call(uploadPath(ctx.wid, upload.id, "abort"), {
        as: ctx.owner,
        method: "POST",
      });

    expect((await abort()).status).toBe(204);
    expect(await findCreative(creative.id)).toBeUndefined();
    expect(await findUploadRow(upload.id)).toMatchObject({
      status: "aborted",
      creativeId: null,
    });
    expect((await abort()).status).toBe(204);
  });

  it("returns 409 UPLOAD_NOT_ACTIVE and keeps the creative of a completed upload", async () => {
    const ctx = await setup();
    const { creative, upload } = await createUpload(ctx.wid, ctx.asset.id, {
      status: "completed",
    });

    await expectError(
      await call(uploadPath(ctx.wid, upload.id, "abort"), {
        as: ctx.owner,
        method: "POST",
      }),
      409,
      "UPLOAD_NOT_ACTIVE",
    );
    expect(await findCreative(creative.id)).toBeDefined();
  });

  it("returns 404 for an upload of another workspace and leaves it untouched", async () => {
    const ctx = await setup();
    const other = await setup();
    const { creative, upload } = await createUpload(other.wid, other.asset.id);

    for (const action of ["abort", "complete"]) {
      await expectError(
        await call(uploadPath(ctx.wid, upload.id, action), {
          as: ctx.owner,
          method: "POST",
        }),
        404,
        "NOT_FOUND",
      );
    }
    await expectError(
      await putChunk(ctx, upload.id, 0, bytesOf(1024)),
      404,
      "NOT_FOUND",
    );
    expect(await findCreative(creative.id)).toBeDefined();
    expect((await findUploadRow(upload.id))?.status).toBe("uploading");
  });
});
