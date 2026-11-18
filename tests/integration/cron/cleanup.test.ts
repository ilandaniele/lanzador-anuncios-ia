import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { Env } from "../../../src/api/env";
import { scheduled } from "../../../src/api/scheduled";
import { magicLinks, sessions } from "../../../src/db/schema/auth";
import { creatives, uploads } from "../../../src/db/schema/creatives";
import { errorEvents } from "../../../src/db/schema/ops";
import {
  insightsCache,
  pilotProposals,
  pilotRuns,
} from "../../../src/db/schema/pilot";
import { oauthStates, workspaces } from "../../../src/db/schema/workspaces";
import {
  createMetaAsset,
  createMetaConnection,
  createUpload,
  createUser,
  createWorkspace,
} from "../../helpers/factory";

const db = drizzle(env.DB);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 17, 12, 30);

type EnqueuedJob = { id: string; params: Record<string, unknown> };

const recordingWorkflow = () => {
  const created: EnqueuedJob[] = [];
  const binding = {
    create: async (job: EnqueuedJob) => {
      created.push(job);
    },
    get: async () => {
      throw new Error("not found");
    },
  } as unknown as Workflow;
  return { binding, created };
};

const failingWorkflow = {
  create: async () => {
    throw new Error("workflow down");
  },
  get: async () => {
    throw new Error("workflow down");
  },
} as unknown as Workflow;

const runScheduled = async (
  scheduledTime = NOW,
  overrides: Partial<Env> = {},
) => {
  const jobs = recordingWorkflow();
  await scheduled(createScheduledController({ scheduledTime }), {
    ...env,
    JOB_WF: jobs.binding,
    ...overrides,
  });
  return jobs.created;
};

const seedTenant = async () => {
  const user = await createUser();
  const { workspace } = await createWorkspace({ owner: user });
  const connection = await createMetaConnection(
    env,
    workspace.id,
    "cron-token",
  );
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { user, workspace, asset };
};

const seedActivity = async (
  lastActivityAt: number | null,
  status = "active",
) => {
  const { workspace } = await seedTenant();
  await db
    .update(workspaces)
    .set({ lastActivityAt, status })
    .where(eq(workspaces.id, workspace.id));
  return workspace.id;
};

const survivors = async (rows: Promise<{ id: string }[]>): Promise<string[]> =>
  (await rows).map(({ id }) => id).sort();

describe("scheduled cleanup", () => {
  it("deletes expired magic links, oauth states and sessions and keeps valid ones", async () => {
    const { user, workspace } = await seedTenant();
    const link = (id: string, expiresAt: number) => ({
      id,
      tokenHash: `hash-${id}`,
      email: "cron@example.test",
      createdAt: NOW - DAY,
      expiresAt,
    });
    const state = (id: string, expiresAt: number) => ({
      id,
      stateHash: `hash-${id}`,
      provider: "meta",
      workspaceId: workspace.id,
      userId: user.id,
      createdAt: NOW - DAY,
      expiresAt,
    });
    const session = (id: string, expiresAt: number) => ({
      id,
      userId: user.id,
      tokenHash: `hash-${id}`,
      rotatedAt: NOW - DAY,
      createdAt: NOW - DAY,
      lastSeenAt: NOW - DAY,
      expiresAt,
    });
    await db
      .insert(magicLinks)
      .values([link("link-old", NOW - HOUR), link("link-ok", NOW + HOUR)]);
    await db
      .insert(oauthStates)
      .values([state("state-old", NOW - HOUR), state("state-ok", NOW + HOUR)]);
    await db
      .insert(sessions)
      .values([
        session("session-old", NOW - HOUR),
        session("session-ok", NOW + DAY),
      ]);

    await runScheduled();

    expect(
      await survivors(
        db
          .select()
          .from(magicLinks)
          .where(inArray(magicLinks.id, ["link-old", "link-ok"])),
      ),
    ).toEqual(["link-ok"]);
    expect(
      await survivors(
        db
          .select()
          .from(oauthStates)
          .where(inArray(oauthStates.id, ["state-old", "state-ok"])),
      ),
    ).toEqual(["state-ok"]);
    expect(
      await survivors(
        db
          .select()
          .from(sessions)
          .where(inArray(sessions.id, ["session-old", "session-ok"])),
      ),
    ).toEqual(["session-ok"]);
  });

  it("expires a 25 h upload and fails its creative but keeps a 23 h one", async () => {
    const { workspace, asset } = await seedTenant();
    const stale = await createUpload(workspace.id, asset.id, {
      createdAt: NOW - 25 * HOUR,
      expiresAt: NOW - HOUR,
    });
    const fresh = await createUpload(workspace.id, asset.id, {
      createdAt: NOW - 23 * HOUR,
      expiresAt: NOW + HOUR,
    });
    const completed = await createUpload(workspace.id, asset.id, {
      createdAt: NOW - 30 * HOUR,
      expiresAt: NOW - 6 * HOUR,
      status: "completed",
    });
    await db
      .update(creatives)
      .set({ status: "ready" })
      .where(eq(creatives.id, completed.creative.id));

    await runScheduled();

    const uploadStatus = async (id: string) =>
      (await db.select().from(uploads).where(eq(uploads.id, id)))[0]?.status;
    const creativeOf = async (id: string) =>
      (await db.select().from(creatives).where(eq(creatives.id, id)))[0];
    expect(await uploadStatus(stale.upload.id)).toBe("expired");
    expect(await creativeOf(stale.creative.id)).toMatchObject({
      status: "failed",
      error: "UPLOAD_EXPIRED",
    });
    expect(await uploadStatus(fresh.upload.id)).toBe("uploading");
    expect(await creativeOf(fresh.creative.id)).toMatchObject({
      status: "uploading",
      error: null,
    });
    expect(await uploadStatus(completed.upload.id)).toBe("completed");
    expect(await creativeOf(completed.creative.id)).toMatchObject({
      status: "ready",
      error: null,
    });
  });

  it("deletes insights cache expired over 24 h ago but keeps recent and leased rows", async () => {
    const { workspace, asset } = await seedTenant();
    const entry = (
      id: string,
      level: string,
      overrides: Partial<typeof insightsCache.$inferInsert>,
    ) => ({
      id,
      workspaceId: workspace.id,
      adAccountAssetId: asset.id,
      level,
      rangeKey: "today",
      dateFrom: "2026-11-17",
      dateTo: "2026-11-17",
      payload: "[]",
      fetchedAt: NOW - 2 * DAY,
      expiresAt: NOW - 2 * DAY,
      ...overrides,
    });
    await db.insert(insightsCache).values([
      entry("cache-old", "account", {}),
      entry("cache-recent", "campaign", { expiresAt: NOW - 2 * HOUR }),
      entry("cache-leased", "health", {
        fetchedAt: 0,
        expiresAt: 0,
        refreshingUntil: NOW + HOUR,
      }),
    ]);

    await runScheduled();

    expect(
      await survivors(
        db
          .select()
          .from(insightsCache)
          .where(eq(insightsCache.workspaceId, workspace.id)),
      ),
    ).toEqual(["cache-leased", "cache-recent"]);
  });

  it("deletes error events older than 30 days and keeps newer ones", async () => {
    const event = (id: string, createdAt: number) => ({
      id,
      source: "api",
      message: "boom",
      createdAt,
    });
    await db
      .insert(errorEvents)
      .values([
        event("err-old", NOW - 31 * DAY),
        event("err-new", NOW - 29 * DAY),
      ]);

    await runScheduled();

    expect(
      await survivors(
        db
          .select()
          .from(errorEvents)
          .where(inArray(errorEvents.id, ["err-old", "err-new"])),
      ),
    ).toEqual(["err-new"]);
  });

  it("expires overdue pending proposals in every workspace and leaves the rest", async () => {
    const tenants = [await seedTenant(), await seedTenant()];
    const proposal = (
      workspaceId: string,
      runId: string,
      id: string,
      overrides: Partial<typeof pilotProposals.$inferInsert> = {},
    ) => ({
      id,
      workspaceId,
      runId,
      ruleType: "pause_low_roas",
      action: "pause",
      adAccountMetaId: "act_1",
      objectLevel: "adset",
      objectMetaId: id,
      objectName: id,
      evidence: "{}",
      dedupeKey: id,
      expiresAt: NOW - HOUR,
      createdAt: NOW - 2 * DAY,
      ...overrides,
    });
    await db.insert(pilotRuns).values(
      tenants.map(({ workspace }, index) => ({
        id: `run-${index}`,
        workspaceId: workspace.id,
        trigger: "cron",
        status: "done",
        startedAt: NOW - 2 * DAY,
      })),
    );
    await db.insert(pilotProposals).values(
      tenants.flatMap(({ workspace }, index) => [
        proposal(workspace.id, `run-${index}`, `overdue-${index}`),
        proposal(workspace.id, `run-${index}`, `valid-${index}`, {
          expiresAt: NOW + HOUR,
        }),
        proposal(workspace.id, `run-${index}`, `dismissed-${index}`, {
          status: "dismissed",
        }),
      ]),
    );

    await runScheduled();

    const statusOf = async (id: string) =>
      (
        await db.select().from(pilotProposals).where(eq(pilotProposals.id, id))
      )[0]?.status;
    for (const index of [0, 1]) {
      expect(await statusOf(`overdue-${index}`)).toBe("expired");
      expect(await statusOf(`valid-${index}`)).toBe("pending");
      expect(await statusOf(`dismissed-${index}`)).toBe("dismissed");
    }
  });
});

describe("scheduled insights pre-warm", () => {
  const hourBucket = Math.floor(NOW / HOUR);

  it("enqueues insights_refresh only for workspaces active in the last 2 h", async () => {
    const recent = await seedActivity(NOW - HOUR);
    const idle = await seedActivity(NOW - 3 * HOUR);
    const never = await seedActivity(null);

    const created = await runScheduled();

    const enqueued = created.map(({ params }) => params.workspaceId);
    expect(enqueued).toContain(recent);
    expect(enqueued).not.toContain(idle);
    expect(enqueued).not.toContain(never);
    expect(created.find(({ params }) => params.workspaceId === recent)).toEqual(
      {
        id: `insights_refresh-${recent}-${hourBucket}`,
        params: {
          kind: "insights_refresh",
          key: `${recent}-${hourBucket}`,
          workspaceId: recent,
        },
      },
    );
  });

  it("uses a different job id on each hourly run", async () => {
    const recent = await seedActivity(NOW - HOUR / 2);
    const idOf = async (scheduledTime: number) =>
      (await runScheduled(scheduledTime)).find(
        ({ params }) => params.workspaceId === recent,
      )?.id;

    const first = await idOf(NOW);
    const second = await idOf(NOW + HOUR);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("skips disabled workspaces", async () => {
    const disabled = await seedActivity(NOW - HOUR, "disabled");

    const created = await runScheduled();

    expect(created.map(({ params }) => params.workspaceId)).not.toContain(
      disabled,
    );
  });

  it("still cleans up and records an error event when enqueueing fails", async () => {
    await seedActivity(NOW - HOUR);
    await db.insert(magicLinks).values({
      id: "link-after-failure",
      tokenHash: "hash-after-failure",
      email: "cron@example.test",
      createdAt: NOW - DAY,
      expiresAt: NOW - HOUR,
    });

    await runScheduled(NOW, { JOB_WF: failingWorkflow });

    expect(
      await db
        .select()
        .from(magicLinks)
        .where(eq(magicLinks.id, "link-after-failure")),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(errorEvents)
        .where(eq(errorEvents.route, "cron:prewarm")),
    ).toMatchObject([{ source: "cron", code: "CRON_FAILED" }]);
  });
});
