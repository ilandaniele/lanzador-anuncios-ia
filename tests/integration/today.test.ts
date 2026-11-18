import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import {
  insightsCache,
  pilotProposals,
  pilotRuns,
} from "../../src/db/schema/pilot";
import { todayResponseSchema } from "../../src/shared/schemas/today";
import {
  api,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { GRAPH_VERSION } from "../helpers/msw/meta";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABtodayRouteToken456";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const PROPOSALS_PER_INSERT = 5;

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
};

type Caller = NonNullable<Parameters<typeof api>[2]>["as"];
type Asset = Awaited<ReturnType<typeof createMetaAsset>>;

const call = (wid: string, as?: Caller) =>
  api(app, `/api/w/${wid}/today`, { as, env: routeEnv });

const accountRow = (asset: Asset, spendMinor: number, purchases = 0) => ({
  level: "account",
  id: asset.metaId,
  name: null,
  campaignId: null,
  adsetId: null,
  date: "2026-11-17",
  spendMinor,
  impressions: 1000,
  clicks: 20,
  purchases,
  purchaseValueMinor: purchases * 5000,
  roas: null,
  cpaMinor: null,
  ctr: null,
  cpmMinor: null,
});

const seedCache = (
  workspaceId: string,
  asset: Asset,
  level: string,
  rangeKey: string,
  rows: unknown[],
) =>
  db
    .insert(insightsCache)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      adAccountAssetId: asset.id,
      level,
      rangeKey,
      dateFrom: "2026-11-17",
      dateTo: "2026-11-17",
      payload: JSON.stringify(rows),
      rowCount: rows.length,
      fetchedAt: Date.now() - 5 * 60_000,
      expiresAt: Date.now() + HOUR_MS,
    })
    .onConflictDoUpdate({
      target: [
        insightsCache.workspaceId,
        insightsCache.adAccountAssetId,
        insightsCache.level,
        insightsCache.rangeKey,
      ],
      set: { payload: JSON.stringify(rows), rowCount: rows.length },
    });

const seedSpend = async (
  wid: string,
  asset: Asset,
  amounts: { today: number; yesterday: number; purchases?: number },
) => {
  await seedCache(wid, asset, "account", "today", [
    accountRow(asset, amounts.today, amounts.purchases),
  ]);
  await seedCache(wid, asset, "account", "yesterday", [
    accountRow(asset, amounts.yesterday),
  ]);
};

const seedHealth = (wid: string, asset: Asset, accountStatus: number) =>
  seedCache(wid, asset, "health", "today", [
    { accountStatus, currency: "USD", isPrepay: false },
  ]);

const seedIssues = (wid: string, asset: Asset, effectiveStatuses: string[]) =>
  seedCache(
    wid,
    asset,
    "issues",
    "today",
    effectiveStatuses.map((effectiveStatus, index) => ({
      adId: `ad_${index}`,
      name: `Anuncio ${index}`,
      effectiveStatus,
      campaignId: null,
      adsetId: null,
      issues: [],
    })),
  );

const seedCleanHealth = async (wid: string, asset: Asset) => {
  await seedHealth(wid, asset, 1);
  await seedIssues(wid, asset, []);
};

const seedProposals = async (wid: string, count: number) => {
  const runId = crypto.randomUUID();
  const base = Date.now();
  await db.insert(pilotRuns).values({
    id: runId,
    workspaceId: wid,
    trigger: "cron",
    status: "done",
    startedAt: base,
  });
  for (let start = 0; start < count; start += PROPOSALS_PER_INSERT) {
    const size = Math.min(PROPOSALS_PER_INSERT, count - start);
    await db.insert(pilotProposals).values(
      Array.from({ length: size }, (_, offset) => {
        const index = start + offset;
        return {
          id: crypto.randomUUID(),
          workspaceId: wid,
          runId,
          ruleType: "pause_no_sales",
          action: "pause",
          adAccountMetaId: "act_1",
          objectLevel: "campaign",
          objectMetaId: `camp_${index}`,
          objectName: `Campaña ${index}`,
          evidence: "{}",
          dedupeKey: `${runId}_${index}`,
          expiresAt: base + DAY_MS,
          createdAt: base + index,
        };
      }),
    );
  }
};

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id, {
    name: "Cuenta A",
  });
  await seedSpend(workspace.id, asset, { today: 0, yesterday: 0 });
  await seedCleanHealth(workspace.id, asset);
  return { wid: workspace.id, owner, asset };
}

const todayOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return todayResponseSchema.parse(await response.json());
};

describe("GET /api/w/:wid/today", () => {
  it("returns 401 without a session", async () => {
    const { wid } = await setup();

    await expectError(await call(wid), 401, "UNAUTHENTICATED");
  });

  it("returns spend of today and yesterday per account", async () => {
    const { wid, owner, asset } = await setup();
    await seedSpend(wid, asset, {
      today: 16557,
      yesterday: 12000,
      purchases: 5,
    });

    const today = await todayOf(await call(wid, owner));

    expect(today.accounts).toEqual([
      {
        id: asset.id,
        name: "Cuenta A",
        currency: "USD",
        spendTodayMinor: 16557,
        spendYesterdayMinor: 12000,
        purchases: 5,
        roas: 1.51,
        cpaMinor: 3311,
      },
    ]);
    expect(today.alerts).toEqual([]);
    expect(today.proposals).toEqual({ pendingCount: 0, top: [] });
    expect(today.launches).toEqual([]);
    expect(today.stale).toBe(false);
    expect(today.updatedAt).not.toBeNull();
  });

  it("orders alerts by severity", async () => {
    const { wid, owner, asset } = await setup();
    await seedSpend(wid, asset, { today: 100, yesterday: 100 });
    await seedHealth(wid, asset, 3);
    await seedIssues(wid, asset, ["DISAPPROVED", "DISAPPROVED", "WITH_ISSUES"]);
    const expiring = await createMetaConnection(keyEnv, wid, TOKEN, {
      metaBusinessId: "business-expiring",
      tokenExpiresAt: Date.now() + 3 * DAY_MS,
    });
    const lapsed = await createMetaConnection(keyEnv, wid, TOKEN, {
      metaBusinessId: "business-lapsed",
      status: "reconnect_required",
    });
    await createMetaConnection(keyEnv, wid, TOKEN, {
      metaBusinessId: "business-far",
      tokenExpiresAt: Date.now() + 30 * DAY_MS,
    });
    const partial = await createLaunch(wid, {
      status: "verified_with_errors",
      createdAt: Date.now() - HOUR_MS,
    });
    const failed = await createLaunch(wid, {
      status: "failed",
      createdAt: Date.now() - 2 * HOUR_MS,
    });
    await createLaunch(wid, {
      status: "failed",
      createdAt: Date.now() - 30 * DAY_MS,
    });
    await createLaunch(wid, { status: "active" });

    const { alerts } = await todayOf(await call(wid, owner));

    expect(
      alerts.map(({ kind, severity, objectId }) => ({
        kind,
        severity,
        objectId,
      })),
    ).toEqual([
      { kind: "reconnect_required", severity: "error", objectId: lapsed.id },
      { kind: "account_problem", severity: "error", objectId: asset.id },
      { kind: "ads_rejected", severity: "error", objectId: asset.id },
      { kind: "launch_failed", severity: "error", objectId: failed.id },
      { kind: "launch_failed", severity: "warn", objectId: partial.id },
      { kind: "token_expiring", severity: "warn", objectId: expiring.id },
    ]);
    expect(alerts.find(({ kind }) => kind === "ads_rejected")?.text).toContain(
      "2",
    );
  });

  it("caps the pending count at 51 when there are more than 50", async () => {
    const { wid, owner } = await setup();
    await seedProposals(wid, 51);

    const { proposals } = await todayOf(await call(wid, owner));

    expect(proposals.pendingCount).toBe(51);
    expect(proposals.top.map(({ objectName }) => objectName)).toEqual([
      "Campaña 50",
      "Campaña 49",
      "Campaña 48",
      "Campaña 47",
      "Campaña 46",
    ]);
  });

  it("counts only pending proposals", async () => {
    const { wid, owner } = await setup();
    await seedProposals(wid, 3);
    await db
      .update(pilotProposals)
      .set({ status: "dismissed" })
      .where(eq(pilotProposals.workspaceId, wid));
    await seedProposals(wid, 2);

    const { proposals } = await todayOf(await call(wid, owner));

    expect(proposals.pendingCount).toBe(2);
  });

  it("returns the last 5 launches, newest first", async () => {
    const { wid, owner } = await setup();
    const base = Date.now();
    const created = await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        createLaunch(wid, { createdAt: base - index * HOUR_MS }),
      ),
    );

    const { launches: recent } = await todayOf(await call(wid, owner));

    expect(recent.map(({ id }) => id)).toEqual(
      created.slice(0, 5).map(({ id }) => id),
    );
  });

  it("marks stale and alerts when an account cannot refresh", async () => {
    const { wid, owner } = await setup();
    const lapsed = await createMetaConnection(keyEnv, wid, TOKEN, {
      metaBusinessId: "business-lapsed",
      status: "reconnect_required",
    });
    const blocked = await createMetaAsset(wid, lapsed.id, {
      name: "Cuenta B",
    });

    const today = await todayOf(await call(wid, owner));

    expect(today.stale).toBe(true);
    expect(today.accounts.find(({ id }) => id === blocked.id)).toMatchObject({
      spendTodayMinor: 0,
      spendYesterdayMinor: 0,
      purchases: 0,
      roas: null,
      cpaMinor: null,
    });
    expect(today.alerts.map(({ kind }) => kind)).toEqual([
      "reconnect_required",
    ]);
  });

  it("does not leak data from another workspace", async () => {
    const mine = await setup();
    const other = await setup();
    await seedSpend(other.wid, other.asset, { today: 999, yesterday: 999 });
    await seedProposals(other.wid, 3);
    await createLaunch(other.wid, { status: "failed" });
    await seedSpend(mine.wid, mine.asset, { today: 1, yesterday: 1 });

    const today = await todayOf(await call(mine.wid, mine.owner));

    expect(today.accounts.map(({ id }) => id)).toEqual([mine.asset.id]);
    expect(today.proposals.pendingCount).toBe(0);
    expect(today.launches).toEqual([]);
    expect(today.alerts).toEqual([]);
  });
});
