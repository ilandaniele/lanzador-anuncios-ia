import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import type { Env } from "../../../src/api/env";
import { runCleanup } from "../../../src/api/services/maintenance/cleanup";
import { creatives } from "../../../src/db/schema/creatives";
import { googleConnections } from "../../../src/db/schema/meta";
import { memberships } from "../../../src/db/schema/workspaces";
import {
  DRIVE_IMPORT_MAX_FILES,
  driveImportResponseSchema,
} from "../../../src/shared/schemas/google";
import { driveImportFileJob } from "../../../src/workflows/jobs/drive-import-file";
import type { JobContext } from "../../../src/workflows/jobs/job-context";
import {
  api,
  createCreative,
  createMetaAsset,
  createMetaConnection,
  createUser,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import {
  googleAccessToken,
  googleCodeExchange,
} from "../../helpers/msw/google";
import { graphVideoUrl, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { openLimiter, testEnv } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const MIB = 1024 * 1024;
const VIDEO_BYTES = 25 * MIB;
const CHUNK_BYTES = 10 * MIB;
const IMAGE_BYTES = 4096;
const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files/:fileId";
const NO_ACCESS = "No tengo acceso a este archivo de Drive";
const FILE_CHANGED = "El archivo de Drive no coincide";
const CREATOR_REMOVED = "ya no puede editar";
const ENQUEUE_FAILURE = "No pude iniciar la importación";
const HOUR_MS = 3_600_000;

const googleEnv = {
  GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  RL_AUTH: openLimiter,
  RL_USER: openLimiter,
  RL_IP: openLimiter,
  RL_EXP: openLimiter,
} satisfies Partial<Env>;

type User = Awaited<ReturnType<typeof createUser>>;

type JobOptions = {
  params: { kind: string; payload?: { fileId?: string } };
};

const fakeJobs = (fails: (options: JobOptions) => boolean = () => false) => {
  const create = vi.fn<(options: unknown) => Promise<object>>(
    async (options) => {
      if (fails(options as JobOptions)) throw new Error("enqueue failed");
      return {};
    },
  );
  const get = async () => {
    throw new Error("instance not found");
  };
  return { create, binding: { create, get } as unknown as Workflow };
};

type Jobs = ReturnType<typeof fakeJobs>;

const enqueuedJobs = (jobs: Jobs) =>
  jobs.create.mock.calls.map(
    ([options]) => (options as { params: { kind: string } }).params,
  );

async function connectGoogle(as: User, wid: string) {
  const connect = await api(app, `/api/w/${wid}/google/connect`, {
    as,
    method: "POST",
    body: {},
    env: googleEnv,
  });
  const { authorizeUrl } = (await connect.json()) as { authorizeUrl: string };
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  server.use(
    googleCodeExchange({
      refreshToken: "1//drive-refresh",
      email: "drive.user@gmail.test",
    }),
  );
  const params = new URLSearchParams({ code: "code_1", state });
  await api(app, `/api/google/oauth/callback?${params}`, {
    as,
    env: googleEnv,
  });
}

async function setup({ google = true } = {}) {
  const editor = await createUser();
  const peer = await createUser();
  const { workspace } = await createWorkspace({
    members: [
      { user: editor, role: "editor" },
      { user: peer, role: "editor" },
    ],
  });
  const connection = await createMetaConnection(env, workspace.id, "EAABdrv");
  const asset = await createMetaAsset(workspace.id, connection.id);
  if (google) await connectGoogle(editor, workspace.id);
  return { editor, peer, wid: workspace.id, asset };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const driveFile = (overrides: Record<string, unknown> = {}) => ({
  id: `drive_${crypto.randomUUID()}`,
  name: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: VIDEO_BYTES,
  ...overrides,
});

const postImport = (
  { editor, wid, asset }: Setup,
  files: unknown[],
  jobs = fakeJobs(),
  { as = editor, adAccountAssetId = asset.id } = {},
) =>
  api(app, `/api/w/${wid}/google/imports`, {
    as,
    method: "POST",
    body: { adAccountAssetId, files },
    env: { ...googleEnv, JOB_WF: jobs.binding },
  });

const recordingStep = () => {
  const names: string[] = [];
  const step = {
    do: async (
      name: string,
      configOrRun: unknown,
      run?: () => Promise<unknown>,
    ) => {
      names.push(name);
      return (run ?? (configOrRun as () => Promise<unknown>))();
    },
    sleep: async () => undefined,
  } as unknown as JobContext["step"];
  return { names, step };
};

async function importingCreative(
  { editor, wid, asset }: Setup,
  overrides: Partial<typeof creatives.$inferInsert>,
) {
  return createCreative(wid, asset.id, {
    status: "importing",
    source: "drive",
    createdBy: editor.id,
    metaImageHash: null,
    metaVideoId: null,
    ...overrides,
  });
}

const runImportJob = (
  { wid, asset }: Setup,
  creativeId: string,
  jobs: Jobs,
) => {
  const { names, step } = recordingStep();
  const run = driveImportFileJob({
    env: testEnv({ ...googleEnv, JOB_WF: jobs.binding }),
    step,
    key: creativeId,
    workspaceId: wid,
    payload: { creativeId, fileId: "drive_file_1", adAccountAssetId: asset.id },
  });
  return { names, run };
};

const driveServes = (
  totalBytes: number,
  mimeType: string,
  { metadataSize = totalBytes, lengthDelta = 0 } = {},
) => {
  const ranges: string[] = [];
  server.use(
    googleAccessToken("ya29.drive-access"),
    http.get(DRIVE_FILE_URL, ({ request }) => {
      if (new URL(request.url).searchParams.get("alt") !== "media") {
        return HttpResponse.json({ size: String(metadataSize), mimeType });
      }
      const range = request.headers.get("Range")!;
      ranges.push(range);
      const [start, end] = range.replace("bytes=", "").split("-").map(Number);
      const length = Math.min(end!, totalBytes - 1) - start! + 1;
      return new HttpResponse(new Uint8Array(length), {
        status: 206,
        headers: { "Content-Length": String(length + lengthDelta) },
      });
    }),
  );
  return ranges;
};

const imageCreative = (ctx: Setup) =>
  importingCreative(ctx, {
    kind: "image",
    contentType: "image/png",
    sizeBytes: IMAGE_BYTES,
  });

const metaAcceptsImage = (ctx: Setup, fileName: string) =>
  server.use(
    metaReplies(`${ctx.asset.metaId}/adimages`, {
      images: {
        [fileName]: {
          hash: "img_hash_drive",
          url: "https://scontent.fbcdn.net/drive.png",
        },
      },
    }),
  );

const readCreative = async (id: string) =>
  (await db.select().from(creatives).where(eq(creatives.id, id)))[0]!;

const nextOffsets = (start: number) => ({
  start_offset: String(Math.min(start + CHUNK_BYTES, VIDEO_BYTES)),
  end_offset: String(Math.min(start + 2 * CHUNK_BYTES, VIDEO_BYTES)),
});

const metaAcceptsVideo = (actId: string, videoId: string) =>
  server.use(
    http.post(graphVideoUrl(`${actId}/advideos`), async ({ request }) => {
      const form = await request.formData();
      const phase = String(form.get("upload_phase"));
      if (phase === "start") {
        return HttpResponse.json({
          upload_session_id: "session_drive",
          video_id: videoId,
          start_offset: "0",
          end_offset: String(CHUNK_BYTES),
        });
      }
      if (phase === "transfer") {
        return HttpResponse.json(nextOffsets(Number(form.get("start_offset"))));
      }
      return HttpResponse.json({ success: true });
    }),
  );

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/google/imports", () => {
  it("rejects more than 30 files with 400", async () => {
    const ctx = await setup({ google: false });
    const files = Array.from({ length: 31 }, () => driveFile());

    const response = await postImport(ctx, files);

    expect(response.status).toBe(400);
  });

  it("rejects an unsupported type with 415", async () => {
    const ctx = await setup();
    const response = await postImport(ctx, [
      driveFile({ name: "doc.pdf", mimeType: "application/pdf" }),
    ]);
    await expectError(response, 415, "UNSUPPORTED_TYPE");
  });

  it("rejects an image over 30 MB with 413", async () => {
    const ctx = await setup();
    const response = await postImport(ctx, [
      driveFile({
        name: "big.png",
        mimeType: "image/png",
        sizeBytes: 31 * MIB,
      }),
    ]);
    await expectError(response, 413, "FILE_TOO_LARGE");
  });

  it("answers 409 when Google is not connected", async () => {
    const ctx = await setup({ google: false });
    const response = await postImport(ctx, [driveFile()]);
    await expectError(response, 409, "GOOGLE_RECONNECT_REQUIRED");
  });

  it("creates importing creatives and enqueues one job per file", async () => {
    const ctx = await setup();
    const jobs = fakeJobs();
    const files = [
      driveFile(),
      driveFile({ name: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 900 }),
    ];

    const response = await postImport(ctx, files, jobs);

    expect(response.status).toBe(202);
    const { data } = driveImportResponseSchema.parse(await response.json());
    expect(data).toHaveLength(2);
    for (const { creativeId } of data) {
      expect(await readCreative(creativeId)).toMatchObject({
        status: "importing",
        source: "drive",
        createdBy: ctx.editor.id,
      });
    }
    expect(enqueuedJobs(jobs)).toEqual(
      data.map(({ creativeId }, index) =>
        expect.objectContaining({
          kind: "drive_import_file",
          payload: {
            creativeId,
            fileId: files[index]!.id,
            adAccountAssetId: ctx.asset.id,
          },
        }),
      ),
    );
  });
});

describe("drive_import_file job", () => {
  it("marks the creative failed when Drive answers 404", async () => {
    const ctx = await setup();
    const creative = await importingCreative(ctx, {
      kind: "image",
      contentType: "image/png",
      sizeBytes: IMAGE_BYTES,
    });
    server.use(
      googleAccessToken("ya29.drive-access"),
      http.get(DRIVE_FILE_URL, () => new HttpResponse(null, { status: 404 })),
    );
    const jobs = fakeJobs();

    await runImportJob(ctx, creative.id, jobs).run;

    const row = await readCreative(creative.id);
    expect(row.status).toBe("failed");
    expect(row.error).toContain(NO_ACCESS);
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it("marks Google reconnect required when Drive answers 401", async () => {
    const ctx = await setup();
    const creative = await importingCreative(ctx, {
      kind: "image",
      contentType: "image/png",
      sizeBytes: IMAGE_BYTES,
    });
    server.use(
      googleAccessToken("ya29.drive-access"),
      http.get(DRIVE_FILE_URL, () => new HttpResponse(null, { status: 401 })),
    );

    await runImportJob(ctx, creative.id, fakeJobs()).run;

    expect((await readCreative(creative.id)).status).toBe("failed");
    const [connection] = await db
      .select()
      .from(googleConnections)
      .where(eq(googleConnections.workspaceId, ctx.wid));
    expect(connection!.status).toBe("reconnect_required");
  });

  it("uploads a 25 MiB video to Meta in 3 chunks", async () => {
    const ctx = await setup();
    const creative = await importingCreative(ctx, {
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: VIDEO_BYTES,
    });
    const ranges = driveServes(VIDEO_BYTES, "video/mp4");
    const videoId = `vid_${crypto.randomUUID()}`;
    metaAcceptsVideo(ctx.asset.metaId, videoId);
    const jobs = fakeJobs();

    const { names, run } = runImportJob(ctx, creative.id, jobs);
    await run;

    expect(ranges).toEqual([
      `bytes=0-${CHUNK_BYTES - 1}`,
      `bytes=${CHUNK_BYTES}-${2 * CHUNK_BYTES - 1}`,
      `bytes=${2 * CHUNK_BYTES}-${VIDEO_BYTES - 1}`,
    ]);
    expect(names.filter((name) => name.startsWith("transfer"))).toHaveLength(3);
    expect(await readCreative(creative.id)).toMatchObject({
      status: "processing",
      metaVideoId: videoId,
    });
    expect(enqueuedJobs(jobs)).toEqual([
      expect.objectContaining({
        kind: "meta_video_status",
        payload: { creativeId: creative.id },
      }),
    ]);
  });

  it("uploads an image to Meta and enqueues tagging", async () => {
    const ctx = await setup();
    const creative = await imageCreative(ctx);
    const ranges = driveServes(IMAGE_BYTES, "image/png");
    metaAcceptsImage(ctx, creative.originalFilename);
    const jobs = fakeJobs();

    await runImportJob(ctx, creative.id, jobs).run;

    expect(ranges).toEqual([`bytes=0-${IMAGE_BYTES - 1}`]);
    expect(await readCreative(creative.id)).toMatchObject({
      status: "ready",
      metaImageHash: "img_hash_drive",
    });
    expect(enqueuedJobs(jobs)).toEqual([
      expect.objectContaining({
        kind: "tag_creative",
        payload: { creativeId: creative.id },
      }),
    ]);
  });
});

describe("POST /api/w/:wid/google/imports limits and access", () => {
  const manyFiles = (count: number) =>
    Array.from({ length: count }, () => driveFile());

  it("imports 30 files in one request", async () => {
    const ctx = await setup();
    const jobs = fakeJobs();

    const response = await postImport(
      ctx,
      manyFiles(DRIVE_IMPORT_MAX_FILES),
      jobs,
    );

    expect(response.status).toBe(202);
    const { data } = driveImportResponseSchema.parse(await response.json());
    expect(data).toHaveLength(DRIVE_IMPORT_MAX_FILES);
    expect(jobs.create).toHaveBeenCalledTimes(DRIVE_IMPORT_MAX_FILES);
    const rows = await db
      .select({ id: creatives.id })
      .from(creatives)
      .where(
        and(
          eq(creatives.workspaceId, ctx.wid),
          eq(creatives.status, "importing"),
        ),
      );
    expect(rows).toHaveLength(DRIVE_IMPORT_MAX_FILES);
  });

  it("answers 429 when imports in flight would exceed the cap", async () => {
    const ctx = await setup();
    await postImport(ctx, manyFiles(DRIVE_IMPORT_MAX_FILES));
    await postImport(ctx, manyFiles(DRIVE_IMPORT_MAX_FILES));

    const response = await postImport(ctx, [driveFile()]);

    await expectError(response, 429, "RATE_LIMITED");
  });

  it("marks the creatives whose job could not be enqueued as failed", async () => {
    const ctx = await setup();
    const files = [driveFile(), driveFile()];
    const failing = files[1]!.id;
    const jobs = fakeJobs(({ params }) => params.payload?.fileId === failing);

    const response = await postImport(ctx, files, jobs);

    expect(response.status).toBe(202);
    const { data } = driveImportResponseSchema.parse(await response.json());
    expect((await readCreative(data[0]!.creativeId)).status).toBe("importing");
    const failed = await readCreative(data[1]!.creativeId);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain(ENQUEUE_FAILURE);
  });

  it("answers 404 for an ad account of another workspace", async () => {
    const ctx = await setup();
    const other = await setup({ google: false });

    const response = await postImport(ctx, [driveFile()], fakeJobs(), {
      adAccountAssetId: other.asset.id,
    });

    await expectError(response, 404, "NOT_FOUND");
  });

  it("does not let an editor use another editor's Google connection", async () => {
    const ctx = await setup();
    const jobs = fakeJobs();

    const response = await postImport(ctx, [driveFile()], jobs, {
      as: ctx.peer,
    });

    await expectError(response, 409, "GOOGLE_RECONNECT_REQUIRED");
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed file id with 400", async () => {
    const ctx = await setup();

    const response = await postImport(ctx, [
      driveFile({ id: "../../etc/passwd" }),
    ]);

    expect(response.status).toBe(400);
  });
});

describe("drive_import_file job safeguards", () => {
  it("fails without downloading when Drive reports another size", async () => {
    const ctx = await setup();
    const creative = await imageCreative(ctx);
    const ranges = driveServes(IMAGE_BYTES, "image/png", {
      metadataSize: IMAGE_BYTES + 1,
    });
    const jobs = fakeJobs();

    await runImportJob(ctx, creative.id, jobs).run;

    const row = await readCreative(creative.id);
    expect(row.status).toBe("failed");
    expect(row.error).toContain(FILE_CHANGED);
    expect(ranges).toEqual([]);
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it("fails when Drive reports a type that is not allowed", async () => {
    const ctx = await setup();
    const creative = await imageCreative(ctx);
    driveServes(IMAGE_BYTES, "application/pdf");

    await runImportJob(ctx, creative.id, fakeJobs()).run;

    expect((await readCreative(creative.id)).error).toContain(FILE_CHANGED);
  });

  it("rejects a range whose length differs from the request", async () => {
    const ctx = await setup();
    const creative = await imageCreative(ctx);
    driveServes(IMAGE_BYTES, "image/png", { lengthDelta: -1 });
    metaAcceptsImage(ctx, creative.originalFilename);

    await expect(
      runImportJob(ctx, creative.id, fakeJobs()).run,
    ).rejects.toThrow();

    expect((await readCreative(creative.id)).status).toBe("failed");
  });

  it("fails when the creator is no longer an editor", async () => {
    const ctx = await setup();
    const creative = await imageCreative(ctx);
    const ranges = driveServes(IMAGE_BYTES, "image/png");
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(
        and(
          eq(memberships.workspaceId, ctx.wid),
          eq(memberships.userId, ctx.editor.id),
        ),
      );

    await runImportJob(ctx, creative.id, fakeJobs()).run;

    const row = await readCreative(creative.id);
    expect(row.status).toBe("failed");
    expect(row.error).toContain(CREATOR_REMOVED);
    expect(ranges).toEqual([]);
  });

  it("marks the video failed when the status job cannot be enqueued", async () => {
    const ctx = await setup();
    const creative = await importingCreative(ctx, {
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: VIDEO_BYTES,
    });
    driveServes(VIDEO_BYTES, "video/mp4");
    metaAcceptsVideo(ctx.asset.metaId, `vid_${crypto.randomUUID()}`);
    const jobs = fakeJobs(({ params }) => params.kind === "meta_video_status");

    await expect(runImportJob(ctx, creative.id, jobs).run).rejects.toThrow();

    expect((await readCreative(creative.id)).status).toBe("failed");
  });
});

describe("cleanup of stuck Drive imports", () => {
  it("fails creatives importing for over 6 hours and keeps recent ones", async () => {
    const ctx = await setup({ google: false });
    const at = Date.now();
    const stuck = await importingCreative(ctx, {
      updatedAt: at - 7 * HOUR_MS,
    });
    const recent = await importingCreative(ctx, {
      updatedAt: at - HOUR_MS,
    });

    await runCleanup(env.DB, at);

    expect(await readCreative(stuck.id)).toMatchObject({
      status: "failed",
      error: "IMPORT_EXPIRED",
    });
    expect((await readCreative(recent.id)).status).toBe("importing");
  });
});
