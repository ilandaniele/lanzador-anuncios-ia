import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { creatives } from "../../../src/db/schema/creatives";
import {
  enqueueJob,
  type JobParams,
  jobInstanceId,
} from "../../../src/api/services/jobs";
import {
  createCreative,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import { graphUrl, metaFails, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const db = drizzle(env.DB);
const THUMBNAIL = "https://scontent.fbcdn.net/thumb.jpg";
const MAX_ATTEMPTS = 20;

const processing = { status: { video_status: "processing" } };

const ready = (width: number, height: number) => ({
  status: { video_status: "ready" },
  format: [
    { filter: "130x130", width: 130, height: 130 },
    { filter: "native", width, height },
  ],
});

const videoStatuses = (videoId: string, replies: unknown[]) => {
  let calls = 0;
  server.use(
    http.get(graphUrl(videoId), () =>
      HttpResponse.json(
        replies[Math.min(calls++, replies.length - 1)] as Record<
          string,
          unknown
        >,
      ),
    ),
    metaReplies(`${videoId}/thumbnails`, {
      data: [{ uri: THUMBNAIL, is_preferred: true }],
    }),
  );
};

async function setup() {
  const { workspace } = await createWorkspace();
  const connection = await createMetaConnection(env, workspace.id, "EAABvideo");
  const asset = await createMetaAsset(workspace.id, connection.id);
  const metaVideoId = `vid_${crypto.randomUUID()}`;
  const creative = await createCreative(workspace.id, asset.id, {
    kind: "video",
    contentType: "video/mp4",
    metaImageHash: null,
    metaVideoId,
    width: 640,
    height: 480,
    status: "processing",
  });
  const job: JobParams = {
    kind: "meta_video_status",
    key: creative.id,
    workspaceId: workspace.id,
    payload: { creativeId: creative.id },
  };
  return { creative, metaVideoId, job };
}

const findCreative = async (id: string) =>
  (await db.select().from(creatives).where(eq(creatives.id, id)))[0]!;

async function runJob(job: JobParams, status: "complete" | "errored") {
  await using instance = await introspectWorkflowInstance(
    env.JOB_WF!,
    jobInstanceId(job),
  );
  await instance.modify(async (m) => {
    await m.disableSleeps();
    await m.disableRetryDelays();
  });
  await enqueueJob(env, job);
  await instance.waitForStatus(status);
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("meta_video_status job", () => {
  it("polls until ready and stores thumbnail, size and status", async () => {
    const { creative, metaVideoId, job } = await setup();
    videoStatuses(metaVideoId, [processing, processing, ready(1080, 1920)]);
    const requests = captureRequests();

    await runJob(job, "complete");

    const saved = await findCreative(creative.id);
    expect(saved).toMatchObject({
      status: "ready",
      thumbnailUrl: THUMBNAIL,
      formatWarning: null,
      width: 1080,
      height: 1920,
      error: null,
    });
    expect(saved.thumbnailRefreshedAt).toBeGreaterThan(0);
    const statusChecks = requests.filter(
      ({ url }) => new URL(url).pathname === `/v24.0/${metaVideoId}`,
    );
    expect(statusChecks).toHaveLength(3);
  });

  it("flags a horizontal video with format_warning", async () => {
    const { creative, metaVideoId, job } = await setup();
    videoStatuses(metaVideoId, [ready(1920, 1080)]);

    await runJob(job, "complete");

    expect(await findCreative(creative.id)).toMatchObject({
      status: "ready",
      formatWarning: "horizontal",
      width: 1920,
      height: 1080,
    });
  });

  it("leaves the creative failed when Meta reports a video error", async () => {
    const { creative, metaVideoId, job } = await setup();
    videoStatuses(metaVideoId, [
      processing,
      { status: { video_status: "error" } },
    ]);

    await runJob(job, "complete");

    expect(await findCreative(creative.id)).toMatchObject({
      status: "failed",
      error: "VIDEO_PROCESSING_FAILED",
      thumbnailUrl: null,
    });
  });

  it("fails the creative after 20 attempts still processing", async () => {
    const { creative, metaVideoId, job } = await setup();
    videoStatuses(metaVideoId, [processing]);
    const requests = captureRequests();

    await runJob(job, "complete");

    expect(await findCreative(creative.id)).toMatchObject({
      status: "failed",
      error: "VIDEO_PROCESSING_TIMEOUT",
    });
    const statusChecks = requests.filter(
      ({ url }) => new URL(url).pathname === `/v24.0/${metaVideoId}`,
    );
    expect(statusChecks).toHaveLength(MAX_ATTEMPTS);
  });

  it("fails the creative and the job when Meta keeps rejecting the check", async () => {
    const { creative, metaVideoId, job } = await setup();
    server.use(
      metaFails(metaVideoId, { error: { message: "Unsupported", code: 100 } }),
    );

    await runJob(job, "errored");

    expect(await findCreative(creative.id)).toMatchObject({
      status: "failed",
      error: "VIDEO_STATUS_UNAVAILABLE",
    });
  });

  it("does not duplicate the job when enqueued twice", async () => {
    const { creative, metaVideoId, job } = await setup();
    videoStatuses(metaVideoId, [ready(1080, 1920)]);
    const requests = captureRequests();
    await using instance = await introspectWorkflowInstance(
      env.JOB_WF!,
      jobInstanceId(job),
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
    });

    const first = await enqueueJob(env, job);
    const second = await enqueueJob(env, job);

    expect(second).toBe(first);
    await instance.waitForStatus("complete");
    expect((await findCreative(creative.id)).status).toBe("ready");
    const statusChecks = requests.filter(
      ({ url }) => new URL(url).pathname === `/v24.0/${metaVideoId}`,
    );
    expect(statusChecks).toHaveLength(1);
  });
});
