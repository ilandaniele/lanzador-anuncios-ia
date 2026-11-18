import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { AppError } from "../../../src/api/lib/errors";
import { insertDefaultPilotRules } from "../../../src/api/repositories/pilot-rules";
import { aiUsage } from "../../../src/db/schema/ops";
import {
  insightsCache,
  pilotProposals,
  pilotRuns,
  protectedCampaigns,
} from "../../../src/db/schema/pilot";
import { workspaces } from "../../../src/db/schema/workspaces";
import {
  pilotProposalsResponseSchema,
  pilotRunResponseSchema,
  pilotRunsResponseSchema,
} from "../../../src/shared/schemas/pilot";
import {
  api,
  createMetaAsset,
  createMetaConnection,
  expectError,
} from "../../helpers/factory";
import { FakeAiProvider } from "../../helpers/fake-ai-provider";
import {
  GRAPH_VERSION,
  graphUrl,
  metaFails,
  metaReplies,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
} from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABpilotRunToken654";
const CAMPAIGN_ID = "120200000000000100";
const MINUTE_MS = 60_000;

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
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { ...options, env: { ...routeEnv, ...options.env } });

const pilotPath = (workspaceId: string, suffix: string) =>
  `/api/w/${workspaceId}/pilot/${suffix}`;

const run = (
  workspaceId: string,
  provider: FakeAiProvider,
  options: Caller = {},
) =>
  call(pilotPath(workspaceId, "run"), {
    method: "POST",
    ...options,
    env: { AI_PROVIDER: provider },
  });

const explanationFor = (
  ids: string[],
  text = "Gastó el doble sin ventas.",
) => ({
  text: JSON.stringify(Object.fromEntries(ids.map((id) => [id, text]))),
});

const echoingProvider = () => {
  const provider = new FakeAiProvider();
  provider.generateText = async (input) => {
    provider.calls.push({ method: "generateText", input });
    const ids = [...input.prompt.matchAll(/"id":"([^"]+)"/g)].map(
      (match) => match[1]!,
    );
    return {
      ...explanationFor(ids),
      usage: {
        model: "fake-model",
        inputTokens: 10,
        outputTokens: 10,
        neurons: 1,
      },
    };
  };
  return provider;
};

const adRow = (overrides: Record<string, unknown> = {}) => ({
  level: "ad",
  id: "6001",
  name: "Ad sin ventas",
  campaignId: CAMPAIGN_ID,
  adsetId: "120200000000000201",
  date: "2026-11-17",
  spendMinor: 5000,
  impressions: 1000,
  clicks: 20,
  purchases: 0,
  purchaseValueMinor: 0,
  roas: null,
  cpaMinor: null,
  ctr: 0.02,
  cpmMinor: 5000,
  ...overrides,
});

const metaCampaign = {
  id: CAMPAIGN_ID,
  name: "CBO activa",
  effective_status: "ACTIVE",
  daily_budget: "5000",
  objective: "OUTCOME_SALES",
  bid_strategy: "LOWEST_COST_WITHOUT_CAP",
};

async function setup({ cacheAgeMs = MINUTE_MS }: { cacheAgeMs?: number } = {}) {
  const seeded = await seedWorkspaceWithRoles();
  const { workspace } = seeded;
  await insertDefaultPilotRules(env.DB, workspace.id, Date.now());
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  const fetchedAt = Date.now() - cacheAgeMs;
  await db.insert(insightsCache).values({
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    adAccountAssetId: asset.id,
    level: "ad",
    rangeKey: "today",
    dateFrom: "2026-11-17",
    dateTo: "2026-11-17",
    payload: JSON.stringify([adRow()]),
    rowCount: 1,
    fetchedAt,
    expiresAt: Date.now() + 60 * MINUTE_MS,
  });
  server.use(
    metaReplies(`${asset.metaId}/campaigns`, { data: [metaCampaign] }),
  );
  return { ...seeded, workspace, asset };
}

const proposalsOf = (workspaceId: string) =>
  db
    .select()
    .from(pilotProposals)
    .where(eq(pilotProposals.workspaceId, workspaceId));

const runsOf = (workspaceId: string) =>
  db.select().from(pilotRuns).where(eq(pilotRuns.workspaceId, workspaceId));

const rewindRuns = (workspaceId: string) =>
  db
    .update(pilotRuns)
    .set({ startedAt: Date.now() - 10 * MINUTE_MS })
    .where(eq(pilotRuns.workspaceId, workspaceId));

const usageOf = (workspaceId: string) =>
  db.select().from(aiUsage).where(eq(aiUsage.workspaceId, workspaceId));

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/pilot/run", () => {
  it("creates proposals from fresh insights with an AI explanation", async () => {
    const { workspace, users } = await setup();
    const provider = echoingProvider();

    const response = await run(workspace.id, provider, { as: users.editor });

    expect(response.status).toBe(200);
    const { run: created, proposals } = pilotRunResponseSchema.parse(
      await response.json(),
    );
    expect(created).toMatchObject({
      trigger: "manual",
      status: "done",
      proposalsCreated: 1,
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      runId: created.id,
      ruleType: "pause_no_sales",
      action: "pause",
      level: "ad",
      objectId: "6001",
      objectName: "Ad sin ventas",
      status: "pending",
      explanation: "Gastó el doble sin ventas.",
    });
    expect(proposals[0]?.evidence).toMatchObject({
      range: "today",
      spendMinor: 5000,
      purchases: 0,
    });
    expect(provider.callsTo("generateText")).toHaveLength(1);
    expect(await usageOf(workspace.id)).toMatchObject([{ feature: "pilot" }]);
  });

  it("creates proposals without explanation when the AI budget is exhausted", async () => {
    const { workspace, users } = await setup();
    await db
      .update(workspaces)
      .set({ aiDailyNeuronsOverride: 0 })
      .where(eq(workspaces.id, workspace.id));
    const provider = new FakeAiProvider();

    const response = await run(workspace.id, provider, { as: users.editor });

    expect(response.status).toBe(200);
    const { run: created, proposals } = pilotRunResponseSchema.parse(
      await response.json(),
    );
    expect(created.proposalsCreated).toBe(1);
    expect(proposals).toMatchObject([{ explanation: null }]);
    expect(provider.calls).toHaveLength(0);
    expect(await usageOf(workspace.id)).toHaveLength(0);
  });

  it("creates proposals without explanation when the AI fails", async () => {
    const { workspace, users } = await setup();
    const provider = new FakeAiProvider({
      generateText: [new AppError(502, "AI_UPSTREAM")],
    });

    const response = await run(workspace.id, provider, { as: users.editor });

    expect(response.status).toBe(200);
    const { proposals } = pilotRunResponseSchema.parse(await response.json());
    expect(proposals).toMatchObject([{ explanation: null }]);
    expect(provider.callsTo("generateText")).toHaveLength(1);
  });

  it("does not call the AI when no rule matches", async () => {
    const { workspace, users } = await setup();
    await db
      .update(insightsCache)
      .set({
        payload: JSON.stringify([adRow({ purchases: 3, spendMinor: 100 })]),
      })
      .where(eq(insightsCache.workspaceId, workspace.id));
    const provider = new FakeAiProvider();

    const response = await run(workspace.id, provider, { as: users.editor });

    const { run: created, proposals } = pilotRunResponseSchema.parse(
      await response.json(),
    );
    expect(created).toMatchObject({ status: "done", proposalsCreated: 0 });
    expect(proposals).toEqual([]);
    expect(provider.calls).toHaveLength(0);
  });

  it("answers 429 with Retry-After when a run started less than 5 minutes ago", async () => {
    const { workspace, users } = await setup();
    await run(workspace.id, echoingProvider(), { as: users.editor });

    const response = await run(workspace.id, echoingProvider(), {
      as: users.editor,
    });

    await expectError(response, 429, "RATE_LIMITED");
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await runsOf(workspace.id)).toHaveLength(1);
  });

  it("answers 409 RUN_IN_PROGRESS while another run is still running", async () => {
    const { workspace, users } = await setup();
    await db.insert(pilotRuns).values({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      trigger: "cron",
      status: "running",
      startedAt: Date.now() - MINUTE_MS,
    });

    await expectError(
      await run(workspace.id, echoingProvider(), { as: users.editor }),
      409,
      "RUN_IN_PROGRESS",
    );
    expect(await proposalsOf(workspace.id)).toEqual([]);
  });

  it("allows a new run after the 5 minute gap", async () => {
    const { workspace, users } = await setup();
    await run(workspace.id, echoingProvider(), { as: users.editor });
    await rewindRuns(workspace.id);

    const response = await run(workspace.id, echoingProvider(), {
      as: users.editor,
    });

    expect(response.status).toBe(200);
    expect(await runsOf(workspace.id)).toHaveLength(2);
  });

  it("does not duplicate a proposal that is still pending", async () => {
    const { workspace, users } = await setup();
    await run(workspace.id, echoingProvider(), { as: users.editor });
    await rewindRuns(workspace.id);
    const provider = echoingProvider();

    const response = await run(workspace.id, provider, { as: users.editor });

    const { run: second, proposals } = pilotRunResponseSchema.parse(
      await response.json(),
    );
    expect(second.proposalsCreated).toBe(0);
    expect(proposals).toEqual([]);
    expect(provider.calls).toHaveLength(0);
    expect(await proposalsOf(workspace.id)).toHaveLength(1);
  });

  it("proposes again once the previous proposal expired", async () => {
    const { workspace, users } = await setup();
    await run(workspace.id, echoingProvider(), { as: users.editor });
    await rewindRuns(workspace.id);
    await db
      .update(pilotProposals)
      .set({ expiresAt: Date.now() - MINUTE_MS })
      .where(eq(pilotProposals.workspaceId, workspace.id));

    const response = await run(workspace.id, echoingProvider(), {
      as: users.editor,
    });

    expect(response.status).toBe(200);
    expect(
      (await proposalsOf(workspace.id)).map(({ status }) => status).sort(),
    ).toEqual(["expired", "pending"]);
  });

  it("does not propose objects of a protected campaign", async () => {
    const { workspace, users, asset } = await setup();
    await db.insert(protectedCampaigns).values({
      workspaceId: workspace.id,
      campaignMetaId: CAMPAIGN_ID,
      adAccountMetaId: asset.metaId,
      createdAt: Date.now(),
    });

    const response = await run(workspace.id, echoingProvider(), {
      as: users.editor,
    });

    const { proposals } = pilotRunResponseSchema.parse(await response.json());
    expect(proposals).toEqual([]);
  });

  it("refreshes insights older than 15 minutes before evaluating", async () => {
    const { workspace, users, asset } = await setup({
      cacheAgeMs: 20 * MINUTE_MS,
    });
    let reads = 0;
    server.use(
      http.get(graphUrl(`${asset.metaId}/insights`), () => {
        reads++;
        return HttpResponse.json({
          data: [
            {
              ad_id: "6002",
              ad_name: "Ad refrescado",
              adset_id: "120200000000000201",
              campaign_id: CAMPAIGN_ID,
              spend: "60.00",
              impressions: "900",
              clicks: "10",
              date_start: "2026-11-17",
              date_stop: "2026-11-17",
            },
          ],
        });
      }),
    );

    const response = await run(workspace.id, echoingProvider(), {
      as: users.editor,
    });

    const { proposals } = pilotRunResponseSchema.parse(await response.json());
    expect(reads).toBe(1);
    expect(proposals).toMatchObject([{ objectId: "6002" }]);
  });

  it("fails the run with META_ERROR when no insights can be refreshed", async () => {
    const { workspace, users, asset } = await setup({
      cacheAgeMs: 20 * MINUTE_MS,
    });
    server.use(
      metaFails(`${asset.metaId}/insights`, {
        error: { message: "boom", type: "OAuthException", code: 2 },
      }),
    );

    await expectError(
      await run(workspace.id, echoingProvider(), { as: users.editor }),
      502,
      "META_ERROR",
    );
    expect(await runsOf(workspace.id)).toMatchObject([
      { status: "failed", error: "META_ERROR" },
    ]);
  });

  it("returns 401 without a session and 403 for a viewer", async () => {
    const { workspace, users } = await setup();

    await expectError(
      await run(workspace.id, echoingProvider()),
      401,
      "UNAUTHENTICATED",
    );
    await expectError(
      await run(workspace.id, echoingProvider(), { as: users.viewer }),
      403,
      "FORBIDDEN_ROLE",
    );
    expect(await runsOf(workspace.id)).toEqual([]);
  });

  it("returns 404 to a non-member of the workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await run(A.workspace.id, echoingProvider(), { as: B.users.owner }),
      404,
      "NOT_FOUND",
    );
    expect(await runsOf(A.workspace.id)).toEqual([]);
  });
});

describe("GET /api/w/:wid/pilot/runs and /pilot/proposals", () => {
  it("lets a viewer list runs and pending proposals", async () => {
    const { workspace, users } = await setup();
    await run(workspace.id, echoingProvider(), { as: users.editor });

    const runs = pilotRunsResponseSchema.parse(
      await (
        await call(pilotPath(workspace.id, "runs"), { as: users.viewer })
      ).json(),
    );
    const pending = pilotProposalsResponseSchema.parse(
      await (
        await call(pilotPath(workspace.id, "proposals"), { as: users.viewer })
      ).json(),
    );
    const expired = pilotProposalsResponseSchema.parse(
      await (
        await call(pilotPath(workspace.id, "proposals?status=expired"), {
          as: users.viewer,
        })
      ).json(),
    );

    expect(runs.data).toMatchObject([{ status: "done", proposalsCreated: 1 }]);
    expect(pending.data).toMatchObject([{ status: "pending" }]);
    expect(expired.data).toEqual([]);
  });

  it("paginates runs newest first", async () => {
    const { workspace, users } = await setup();
    await db.insert(pilotRuns).values(
      [3, 2, 1].map((minutesAgo) => ({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        trigger: "cron",
        status: "done",
        startedAt: Date.now() - minutesAgo * 60 * MINUTE_MS,
      })),
    );

    const first = pilotRunsResponseSchema.parse(
      await (
        await call(pilotPath(workspace.id, "runs?limit=2"), {
          as: users.viewer,
        })
      ).json(),
    );
    const second = pilotRunsResponseSchema.parse(
      await (
        await call(
          pilotPath(workspace.id, `runs?limit=2&cursor=${first.nextCursor}`),
          { as: users.viewer },
        )
      ).json(),
    );

    const startedAt = [...first.data, ...second.data].map(
      (row) => row.startedAt,
    );
    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    expect(second.data).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(startedAt).toEqual([...startedAt].sort().reverse());
  });

  it("rejects an unknown proposal status", async () => {
    const { workspace, users } = await setup();

    await expectError(
      await call(pilotPath(workspace.id, "proposals?status=executing"), {
        as: users.viewer,
      }),
      400,
      "VALIDATION",
    );
  });

  it("does not leak proposals or runs of another workspace", async () => {
    const [a, b] = await Promise.all([setup(), setup()]);
    await run(a.workspace.id, echoingProvider(), { as: a.users.editor });

    const proposals = pilotProposalsResponseSchema.parse(
      await (
        await call(pilotPath(b.workspace.id, "proposals"), {
          as: b.users.viewer,
        })
      ).json(),
    );
    const runs = pilotRunsResponseSchema.parse(
      await (
        await call(pilotPath(b.workspace.id, "runs"), { as: b.users.viewer })
      ).json(),
    );

    expect(proposals.data).toEqual([]);
    expect(runs.data).toEqual([]);
    expect(
      await db
        .select()
        .from(pilotProposals)
        .where(
          and(
            eq(pilotProposals.workspaceId, a.workspace.id),
            eq(pilotProposals.status, "pending"),
          ),
        ),
    ).toHaveLength(1);
  });
});
