import type { WorkflowStep } from "cloudflare:workers";
import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../../../src/api/env";
import { AI_TAGGING_ESTIMATED_NEURONS } from "../../../src/shared/constants";
import {
  aadFor,
  decryptToken,
  encryptToken,
} from "../../../src/api/lib/token-crypto";
import { utcPeriods } from "../../../src/api/lib/time";
import { googleTokenAad } from "../../../src/api/services/google/connection";
import { scheduled } from "../../../src/api/scheduled";
import { creatives } from "../../../src/db/schema/creatives";
import {
  googleConnections,
  metaConnections,
} from "../../../src/db/schema/meta";
import { usageCounters } from "../../../src/db/schema/ops";
import { workspaces } from "../../../src/db/schema/workspaces";
import { JOB_HANDLERS } from "../../../src/workflows/jobs";
import {
  createCreative,
  createMetaAsset,
  createMetaConnection,
  createUser,
  createWorkspace,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import { graphUrl, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const db = drizzle(env.DB);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const THUMBNAIL = "https://scontent.fbcdn.net/thumb.jpg";

type EnqueuedJob = { id: string; params: Record<string, unknown> };

const runScheduled = async (overrides: Partial<Env> = {}) => {
  const created: EnqueuedJob[] = [];
  const binding = {
    create: async (job: EnqueuedJob) => {
      created.push(job);
    },
    get: async () => {
      throw new Error("not found");
    },
  } as unknown as Workflow;
  await scheduled(createScheduledController({ scheduledTime: NOW }), {
    ...env,
    JOB_WF: binding,
    ...overrides,
  });
  return created;
};

const jobsOfKind = (jobs: EnqueuedJob[], kind: string) =>
  jobs.filter(({ params }) => params.kind === kind);

const seedTenant = async (token = "maintenance-token") => {
  const { workspace } = await createWorkspace();
  const connection = await createMetaConnection(env, workspace.id, token);
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { workspace, connection, asset };
};

afterEach(() => {
  server.events.removeAllListeners();
});

describe("workspace purge", () => {
  const step = {
    do: (_name: string, _config: unknown, run: () => Promise<unknown>) => run(),
  } as unknown as WorkflowStep;

  const runPurgeJob = (workspaceId: string) =>
    JOB_HANDLERS.purge_workspace!({
      env,
      step,
      key: workspaceId,
      workspaceId,
      payload: {},
    });

  const seedDeleting = async (deletedDaysAgo: number) => {
    const { workspace, asset } = await seedTenant();
    await createCreative(workspace.id, asset.id);
    const deletedAt = NOW - deletedDaysAgo * DAY;
    await db
      .update(workspaces)
      .set({ status: "deleting", deletedAt })
      .where(eq(workspaces.id, workspace.id));
    await db.insert(usageCounters).values({
      scope: "workspace",
      scopeId: workspace.id,
      period: utcPeriods(NOW).day,
      metric: "ai_neurons",
      value: 10,
      updatedAt: NOW,
    });
    return workspace.id;
  };

  const tablesWithWorkspaceId = async () => {
    const { results } = await env.DB.prepare(
      `SELECT m.name AS name FROM sqlite_master m
       JOIN pragma_table_info(m.name) p
       WHERE m.type = 'table' AND p.name = 'workspace_id'`,
    ).all<{ name: string }>();
    return results.map(({ name }) => name);
  };

  const rowsReferencing = async (workspaceId: string) => {
    const counts = await Promise.all(
      (await tablesWithWorkspaceId()).map(async (table) => {
        const row = await env.DB.prepare(
          `SELECT count(*) AS total FROM "${table}" WHERE workspace_id = ?`,
        )
          .bind(workspaceId)
          .first<{ total: number }>();
        return row!.total;
      }),
    );
    const workspaceRows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    const counterRows = await db
      .select({ value: usageCounters.value })
      .from(usageCounters)
      .where(eq(usageCounters.scopeId, workspaceId));
    return (
      counts.reduce((sum, count) => sum + count, 0) +
      workspaceRows.length +
      counterRows.length
    );
  };

  it("purges a workspace deleting for 8 days with all its rows and keeps one of 6 days", async () => {
    const expired = await seedDeleting(8);
    const recent = await seedDeleting(6);
    expect(await rowsReferencing(expired)).toBeGreaterThan(4);

    const purgeJobs = jobsOfKind(await runScheduled(), "purge_workspace");
    const purgedIds = purgeJobs.map(({ params }) => params.workspaceId);
    expect(purgedIds).toContain(expired);
    expect(purgedIds).not.toContain(recent);
    expect(purgeJobs.map(({ id }) => id)).toContain(
      `purge_workspace-${expired}-${Math.floor(NOW / HOUR)}`,
    );

    await runPurgeJob(expired);
    await runPurgeJob(recent);

    expect(await rowsReferencing(expired)).toBe(0);
    const [kept] = await db
      .select({ status: workspaces.status })
      .from(workspaces)
      .where(eq(workspaces.id, recent));
    expect(kept).toEqual({ status: "deleting" });
    expect(await rowsReferencing(recent)).toBeGreaterThan(4);
  });

  it("does not purge a workspace restored after the job was enqueued", async () => {
    const restored = await seedDeleting(8);
    await db
      .update(workspaces)
      .set({ status: "active", deletedAt: null })
      .where(eq(workspaces.id, restored));

    await runPurgeJob(restored);

    expect(await rowsReferencing(restored)).toBeGreaterThan(4);
  });
});

describe("pending AI tags", () => {
  const seedPendingMany = async (count: number) => {
    const { workspace, asset } = await seedTenant();
    const pending = [];
    for (let index = 0; index < count; index++) {
      pending.push(
        await createCreative(workspace.id, asset.id, {
          thumbnailUrl: THUMBNAIL,
          aiStatus: "pending",
          createdAt: NOW - (count - index) * 1000,
        }),
      );
    }
    return {
      workspaceId: workspace.id,
      creativeIds: pending.map(({ id }) => id),
    };
  };

  const seedPending = async () => {
    const { workspaceId, creativeIds } = await seedPendingMany(1);
    return { workspaceId, creativeId: creativeIds[0]! };
  };

  const tagJobsOf = (jobs: EnqueuedJob[], workspaceId: string) =>
    jobsOfKind(jobs, "tag_creative").filter(
      ({ params }) => params.workspaceId === workspaceId,
    );

  const aiStatusOf = async (id: string) =>
    (
      await db
        .select({ aiStatus: creatives.aiStatus })
        .from(creatives)
        .where(eq(creatives.id, id))
    )[0]!.aiStatus;

  const tagJobFor = (jobs: EnqueuedJob[], creativeId: string) =>
    jobsOfKind(jobs, "tag_creative").find(
      ({ params }) =>
        (params.payload as { creativeId: string }).creativeId === creativeId,
    );

  it("re-enqueues a pending creative when there is AI quota", async () => {
    const { workspaceId, creativeId } = await seedPending();

    const job = tagJobFor(await runScheduled(), creativeId);

    expect(job?.params).toMatchObject({ kind: "tag_creative", workspaceId });
    expect(await aiStatusOf(creativeId)).toBe("queued");
  });

  it("enqueues at most 5 creatives per workspace per run", async () => {
    const { workspaceId, creativeIds } = await seedPendingMany(7);

    const jobs = tagJobsOf(await runScheduled(), workspaceId);

    expect(jobs).toHaveLength(5);
    const statuses = await Promise.all(creativeIds.map(aiStatusOf));
    expect(statuses).toEqual([
      ...Array(5).fill("queued"),
      "pending",
      "pending",
    ]);
  });

  it("enqueues only the tags that fit in a workspace near its daily cap", async () => {
    const { workspaceId, creativeIds } = await seedPendingMany(4);
    await db.insert(usageCounters).values({
      scope: "workspace",
      scopeId: workspaceId,
      period: utcPeriods(NOW).day,
      metric: "ai_neurons",
      value: 2000 - 2 * AI_TAGGING_ESTIMATED_NEURONS - 50,
      updatedAt: NOW,
    });

    const jobs = tagJobsOf(await runScheduled(), workspaceId);

    expect(jobs.map(({ params }) => params.payload)).toEqual([
      { creativeId: creativeIds[0] },
      { creativeId: creativeIds[1] },
    ]);
  });

  it("returns creatives stuck in queued for over 6 hours to pending", async () => {
    const { workspace, asset } = await seedTenant();
    const stuck = await createCreative(workspace.id, asset.id, {
      aiStatus: "queued",
      updatedAt: NOW - 7 * HOUR,
    });
    const recent = await createCreative(workspace.id, asset.id, {
      aiStatus: "queued",
      updatedAt: NOW - HOUR,
    });

    await runScheduled();

    expect(await aiStatusOf(stuck.id)).toBe("pending");
    expect(await aiStatusOf(recent.id)).toBe("queued");
  });

  it("keeps a pending creative waiting while its workspace has no daily quota", async () => {
    const { workspaceId, creativeId } = await seedPending();
    await db.insert(usageCounters).values({
      scope: "workspace",
      scopeId: workspaceId,
      period: utcPeriods(NOW).day,
      metric: "ai_neurons",
      value: 1_000_000,
      updatedAt: NOW,
    });

    expect(tagJobFor(await runScheduled(), creativeId)).toBeUndefined();
    expect(await aiStatusOf(creativeId)).toBe("pending");
  });

  it("keeps every pending creative waiting while the global quota is exhausted", async () => {
    const { creativeId } = await seedPending();
    const globalCounter = {
      scope: "global",
      scopeId: "app",
      period: utcPeriods(NOW).day,
      metric: "ai_neurons",
    };
    await db
      .insert(usageCounters)
      .values({
        ...globalCounter,
        value: env.WORKERS_AI_DAILY_NEURON_CAP,
        updatedAt: NOW,
      })
      .onConflictDoUpdate({
        target: [
          usageCounters.scope,
          usageCounters.scopeId,
          usageCounters.period,
          usageCounters.metric,
        ],
        set: { value: env.WORKERS_AI_DAILY_NEURON_CAP },
      });

    try {
      expect(tagJobFor(await runScheduled(), creativeId)).toBeUndefined();
      expect(await aiStatusOf(creativeId)).toBe("pending");
    } finally {
      await db
        .delete(usageCounters)
        .where(
          and(
            eq(usageCounters.scope, "global"),
            eq(usageCounters.period, globalCounter.period),
          ),
        );
    }
  });
});

describe("thumbnail refresh", () => {
  const OLD_THUMBNAIL = "https://scontent.fbcdn.net/old.jpg";
  const freshUrl = (key: string) => `https://scontent.fbcdn.net/new-${key}.jpg`;

  const seedVideo = (
    workspaceId: string,
    assetId: string,
    metaVideoId: string,
    refreshedAgo: number,
  ) =>
    createCreative(workspaceId, assetId, {
      kind: "video",
      contentType: "video/mp4",
      metaImageHash: null,
      metaVideoId,
      thumbnailUrl: OLD_THUMBNAIL,
      thumbnailRefreshedAt: NOW - refreshedAgo,
      aiStatus: "done",
    });

  const thumbnailsOf = (ids: string[]) =>
    db
      .select({
        id: creatives.id,
        thumbnailUrl: creatives.thumbnailUrl,
        thumbnailRefreshedAt: creatives.thumbnailRefreshedAt,
      })
      .from(creatives)
      .where(inArray(creatives.id, ids));

  it("refreshes 60 stale video thumbnails in 2 calls and leaves a 5 h one untouched", async () => {
    const { workspace, asset } = await seedTenant();
    const stale = await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        seedVideo(workspace.id, asset.id, `9100${index}`, 21 * HOUR),
      ),
    );
    const recent = await seedVideo(workspace.id, asset.id, "9200", 5 * HOUR);
    server.use(
      http.get(graphUrl(""), ({ request }) => {
        const ids = new URL(request.url).searchParams.get("ids")!.split(",");
        return HttpResponse.json(
          Object.fromEntries(
            ids.map((id) => [id, { id, picture: freshUrl(id) }]),
          ),
        );
      }),
    );
    const requests = captureRequests();

    await runScheduled();

    const pictureCalls = requests.filter(
      ({ url }) => new URL(url).searchParams.get("fields") === "picture",
    );
    expect(pictureCalls).toHaveLength(2);
    expect(
      pictureCalls
        .map(
          ({ url }) => new URL(url).searchParams.get("ids")!.split(",").length,
        )
        .sort(),
    ).toEqual([10, 50]);
    const refreshed = await thumbnailsOf(stale.map(({ id }) => id));
    expect(refreshed).toHaveLength(60);
    for (const row of refreshed) {
      const video = stale.find(({ id }) => id === row.id)!;
      expect(row).toMatchObject({
        thumbnailUrl: freshUrl(video.metaVideoId!),
        thumbnailRefreshedAt: NOW,
      });
    }
    expect(await thumbnailsOf([recent.id])).toEqual([
      {
        id: recent.id,
        thumbnailUrl: OLD_THUMBNAIL,
        thumbnailRefreshedAt: NOW - 5 * HOUR,
      },
    ]);
  });

  it("stamps every attempted row so a failing connection does not starve the others", async () => {
    const failing = await seedTenant("failing-token");
    const working = await seedTenant("working-token");
    const failingVideos = await Promise.all(
      ["8300", "8301"].map((id) =>
        seedVideo(failing.workspace.id, failing.asset.id, id, 30 * HOUR),
      ),
    );
    const [trusted, untrusted] = await Promise.all(
      ["8400", "8401"].map((id) =>
        seedVideo(working.workspace.id, working.asset.id, id, 30 * HOUR),
      ),
    );
    server.use(
      http.get(graphUrl(""), ({ request }) => {
        const ids = new URL(request.url).searchParams.get("ids")!.split(",");
        if (ids.some((id) => id.startsWith("83"))) {
          return HttpResponse.json(
            {
              error: {
                message: "Invalid parameter",
                type: "OAuthException",
                code: 100,
              },
            },
            { status: 400 },
          );
        }
        return HttpResponse.json({
          "8400": { id: "8400", picture: freshUrl("8400") },
          "8401": { id: "8401", picture: "https://evil.example/8401.jpg" },
        });
      }),
    );

    await runScheduled();

    expect(
      await thumbnailsOf([...failingVideos, untrusted!].map(({ id }) => id)),
    ).toEqual(
      expect.arrayContaining(
        [...failingVideos, untrusted!].map(({ id }) => ({
          id,
          thumbnailUrl: OLD_THUMBNAIL,
          thumbnailRefreshedAt: NOW,
        })),
      ),
    );
    expect(await thumbnailsOf([trusted!.id])).toEqual([
      {
        id: trusted!.id,
        thumbnailUrl: freshUrl("8400"),
        thumbnailRefreshedAt: NOW,
      },
    ]);
  });

  it("refreshes stale image thumbnails through the ad account adimages edge", async () => {
    const { workspace, asset } = await seedTenant();
    const image = await createCreative(workspace.id, asset.id, {
      thumbnailUrl: OLD_THUMBNAIL,
      thumbnailRefreshedAt: NOW - 30 * HOUR,
      aiStatus: "done",
    });
    const hash = image.metaImageHash!;
    server.use(
      metaReplies(`${asset.metaId}/adimages`, {
        data: [{ hash, url: freshUrl(hash) }],
      }),
    );
    const requests = captureRequests();

    await runScheduled();

    const imageCall = requests.find(({ url }) =>
      new URL(url).pathname.endsWith(`${asset.metaId}/adimages`),
    );
    const params = new URL(imageCall!.url).searchParams;
    expect(JSON.parse(params.get("hashes")!)).toEqual([hash]);
    expect(params.get("fields")).toBe("hash,url");
    expect(await thumbnailsOf([image.id])).toEqual([
      { id: image.id, thumbnailUrl: freshUrl(hash), thumbnailRefreshedAt: NOW },
    ]);
  });
});

describe("token key rotation", () => {
  const NEW_KEY = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  );
  const rotatedEnv = {
    TOKEN_ENC_KEY_CURRENT: 2,
    TOKEN_ENC_KEY_V2: NEW_KEY,
  } as unknown as Partial<Env>;
  const newKeyEnv = { ...env, ...rotatedEnv } as Env;

  const metaVersions = () =>
    db
      .select({
        id: metaConnections.id,
        workspaceId: metaConnections.workspaceId,
        tokenCiphertext: metaConnections.tokenCiphertext,
        tokenIv: metaConnections.tokenIv,
        tokenKeyVersion: metaConnections.tokenKeyVersion,
      })
      .from(metaConnections);

  const seedGoogleConnection = async (workspaceId: string, token: string) => {
    const user = await createUser();
    const id = crypto.randomUUID();
    const sealed = await encryptToken(
      env,
      token,
      googleTokenAad({ workspaceId, userId: user.id }, id),
    );
    await db.insert(googleConnections).values({
      id,
      workspaceId,
      userId: user.id,
      googleEmail: "drive@example.test",
      refreshTokenCiphertext: Buffer.from(sealed.ciphertext),
      refreshTokenIv: Buffer.from(sealed.iv),
      tokenKeyVersion: sealed.keyVersion,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return { id, userId: user.id };
  };

  it("re-encrypts 50 tokens per run with the new key, Meta and Google", async () => {
    const { workspace } = await createWorkspace();
    const tokens = new Map<string, string>();
    for (let index = 0; index < 55; index++) {
      const token = `rotation-token-${index}`;
      const connection = await createMetaConnection(env, workspace.id, token);
      tokens.set(connection.id, token);
    }
    const google = await seedGoogleConnection(workspace.id, "google-refresh");
    const before = await metaVersions();
    expect(before.every(({ tokenKeyVersion }) => tokenKeyVersion === 1)).toBe(
      true,
    );

    await runScheduled(rotatedEnv);

    const after = await metaVersions();
    const rotated = after.filter(
      ({ tokenKeyVersion }) => tokenKeyVersion === 2,
    );
    expect(rotated).toHaveLength(50);
    expect(after.length - rotated.length).toBe(before.length - 50);
    for (const row of rotated.filter(({ id }) => tokens.has(id))) {
      const plaintext = await decryptToken(
        newKeyEnv,
        {
          ciphertext: new Uint8Array(row.tokenCiphertext),
          iv: new Uint8Array(row.tokenIv),
          keyVersion: 2,
        },
        aadFor("meta_connections", row.id, row.workspaceId),
      );
      expect(plaintext).toBe(tokens.get(row.id));
    }

    const [googleRow] = await db
      .select()
      .from(googleConnections)
      .where(eq(googleConnections.id, google.id));
    expect(googleRow!.tokenKeyVersion).toBe(2);
    expect(
      await decryptToken(
        newKeyEnv,
        {
          ciphertext: new Uint8Array(googleRow!.refreshTokenCiphertext),
          iv: new Uint8Array(googleRow!.refreshTokenIv),
          keyVersion: 2,
        },
        googleTokenAad(
          { workspaceId: workspace.id, userId: google.userId },
          google.id,
        ),
      ),
    ).toBe("google-refresh");

    await runScheduled(rotatedEnv);

    expect(
      (await metaVersions()).every(
        ({ tokenKeyVersion }) => tokenKeyVersion === 2,
      ),
    ).toBe(true);
  });

  it("skips tokens sealed with an unconfigured key so rotatable ones progress", async () => {
    const { workspace } = await createWorkspace();
    const orphaned = [];
    for (let index = 0; index < 55; index++) {
      orphaned.push(
        await createMetaConnection(env, workspace.id, `orphan-${index}`),
      );
    }
    await db
      .update(metaConnections)
      .set({ tokenKeyVersion: 7 })
      .where(
        inArray(
          metaConnections.id,
          orphaned.map(({ id }) => id),
        ),
      );
    const rotatable = await createMetaConnection(
      env,
      workspace.id,
      "rotatable",
    );

    await runScheduled(rotatedEnv);

    const versions = new Map(
      (await metaVersions()).map(({ id, tokenKeyVersion }) => [
        id,
        tokenKeyVersion,
      ]),
    );
    expect(versions.get(rotatable.id)).toBe(2);
    expect(orphaned.every(({ id }) => versions.get(id) === 7)).toBe(true);
  });
});
