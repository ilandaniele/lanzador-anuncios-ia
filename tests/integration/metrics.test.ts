import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { launchItems } from "../../src/db/schema/launches";
import { auditLog } from "../../src/db/schema/ops";
import { protectedCampaigns } from "../../src/db/schema/pilot";
import {
  metricsResponseSchema,
  refreshMetricsResponseSchema,
  topAdsResponseSchema,
  winningTagsResponseSchema,
} from "../../src/shared/schemas/metrics";
import campaignFixture from "../fixtures/insights/campaign.json";
import accountFixture from "../fixtures/insights/account.json";
import {
  api,
  createCreative,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createProduct,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { captureRequests } from "../helpers/meta-graph";
import {
  GRAPH_VERSION,
  graphUrl,
  metaFails,
  metaReplies,
} from "../helpers/msw/meta";
import { server } from "../helpers/msw/server";
import paramFixture from "../fixtures/meta/error-param.json";
import { blockedLimiter, openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABmetricsRouteToken987";
const WINNER = "120000000000101";
const LOSER = "120000000000102";
const HOUR_MS = 3_600_000;

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

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { wid: workspace.id, owner, asset };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const metricsPath = (wid: string, suffix = "", query = "") =>
  `/api/w/${wid}/metrics${suffix}${query ? `?${query}` : ""}`;

const insightsByLevel = (
  path: string,
  byLevel: Record<string, object>,
  counter = { calls: 0 },
) => {
  server.use(
    http.get(graphUrl(path), ({ request }) => {
      counter.calls++;
      const level = new URL(request.url).searchParams.get("level") ?? "";
      return HttpResponse.json(byLevel[level] ?? { data: [] });
    }),
  );
  return counter;
};

const mockMeta = (
  { asset }: Setup,
  byLevel: Record<string, object> = {
    campaign: campaignFixture,
    account: accountFixture,
  },
) => {
  server.use(
    metaReplies(`${asset.metaId}/campaigns`, {
      data: [
        {
          id: WINNER,
          name: "CBO Ganadora",
          effective_status: "ACTIVE",
          daily_budget: "5000",
        },
      ],
    }),
  );
  return insightsByLevel(`${asset.metaId}/insights`, byLevel);
};

const adInsight = (adId: string, spend: string, purchaseValue: string) => ({
  ad_id: adId,
  ad_name: `Anuncio ${adId}`,
  adset_id: "120000000000201",
  campaign_id: WINNER,
  spend,
  impressions: "1000",
  clicks: "20",
  actions: [{ action_type: "omni_purchase", value: "2" }],
  action_values: [{ action_type: "omni_purchase", value: purchaseValue }],
  date_start: "2026-11-17",
  date_stop: "2026-11-17",
});

const rowsOf = async (response: Response) =>
  metricsResponseSchema.parse(await response.json());

afterEach(() => {
  server.events.removeAllListeners();
});

describe("GET /api/w/:wid/metrics", () => {
  it("returns 401 without a session", async () => {
    const { wid } = await setup();

    await expectError(await call(metricsPath(wid)), 401, "UNAUTHENTICATED");
  });

  it("builds rows, totals and previous totals from Meta on a cold cache", async () => {
    const context = await setup();
    mockMeta(context);

    const response = await call(metricsPath(context.wid), {
      as: context.owner,
    });

    expect(response.status).toBe(200);
    const body = await rowsOf(response);
    expect(body.data.map(({ id }) => id)).toEqual([
      WINNER,
      LOSER,
      "120000000000103",
    ]);
    expect(body.data[0]).toEqual({
      id: WINNER,
      name: "CBO Ganadora",
      level: "campaign",
      status: "ACTIVE",
      adAccountId: context.asset.id,
      currency: "USD",
      dailyBudgetMinor: 5000,
      spendMinor: 12550,
      purchases: 5,
      purchaseValueMinor: 50200,
      roas: 4,
      cpaMinor: 2510,
      ctr: 2.5,
      cpmMinor: 1255,
      protected: false,
    });
    expect(body.totals).toHaveLength(1);
    expect(body.totals[0]).toMatchObject({
      currency: "USD",
      spendMinor: 16557,
    });
    expect(body.previousTotals).toHaveLength(1);
    expect(body.stale).toBe(false);
    expect(body.updatedAt).not.toBeNull();
    expect(body.nextCursor).toBeNull();
    expect(body).not.toHaveProperty("daily");
  });

  it("serves the cache on the second call", async () => {
    const context = await setup();
    const insights = mockMeta(context);
    await call(metricsPath(context.wid), { as: context.owner });
    const callsAfterFirst = insights.calls;

    const response = await call(metricsPath(context.wid), {
      as: context.owner,
    });

    expect(response.status).toBe(200);
    expect(insights.calls).toBe(callsAfterFirst);
  });

  it("sorts with the sort query and paginates with a cursor", async () => {
    const context = await setup();
    mockMeta(context);
    const query = "sort=spendMinor:asc&limit=2";

    const first = await rowsOf(
      await call(metricsPath(context.wid, "", query), { as: context.owner }),
    );
    const second = await rowsOf(
      await call(
        metricsPath(context.wid, "", `${query}&cursor=${first.nextCursor}`),
        { as: context.owner },
      ),
    );

    expect(first.data.map(({ id }) => id)).toEqual(["120000000000103", LOSER]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.data.map(({ id }) => id)).toEqual([WINNER]);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a cursor that is not in the result", async () => {
    const context = await setup();
    mockMeta(context);
    const cursor = btoa(JSON.stringify({ id: "nope" }));

    const response = await call(
      metricsPath(context.wid, "", `cursor=${cursor}`),
      { as: context.owner },
    );

    await expectError(response, 400, "VALIDATION");
  });

  it("rejects an unknown sort key with 400", async () => {
    const { wid, owner } = await setup();

    const response = await call(metricsPath(wid, "", "sort=secret:asc"), {
      as: owner,
    });

    await expectError(response, 400, "VALIDATION");
  });

  it("answers 422 RANGE_INVALID for a range of 401 days", async () => {
    const context = await setup();
    const insights = mockMeta(context);

    const response = await call(
      metricsPath(
        context.wid,
        "",
        "range=custom&from=2024-12-01&to=2026-01-05",
      ),
      { as: context.owner },
    );

    await expectError(response, 422, "RANGE_INVALID");
    expect(insights.calls).toBe(0);
  });

  it("answers 422 RANGE_INVALID for a future range even without ad accounts", async () => {
    const { workspace, owner } = await createWorkspace();

    const response = await call(
      metricsPath(
        workspace.id,
        "",
        "range=custom&from=2999-01-01&to=2999-01-02",
      ),
      { as: owner },
    );

    await expectError(response, 422, "RANGE_INVALID");
  });

  it("answers 400 for a custom range without dates", async () => {
    const { wid, owner } = await setup();

    const response = await call(metricsPath(wid, "", "range=custom"), {
      as: owner,
    });

    await expectError(response, 400, "VALIDATION");
  });

  it("ignores ad accounts of another workspace", async () => {
    const mine = await setup();
    const theirs = await setup();
    mockMeta(mine);
    mockMeta(theirs);
    const requests = captureRequests();

    const response = await call(
      metricsPath(mine.wid, "", `adAccountIds=${theirs.asset.id}`),
      { as: mine.owner },
    );

    const body = await rowsOf(response);
    expect(body.data).toEqual([]);
    expect(body.totals).toEqual([]);
    expect(requests.filter(({ url }) => url.includes("/insights"))).toEqual([]);
  });

  it("returns the daily series when asked", async () => {
    const context = await setup();
    mockMeta(context);

    const body = await rowsOf(
      await call(metricsPath(context.wid, "", "daily=true"), {
        as: context.owner,
      }),
    );

    expect(body.daily).toEqual([
      expect.objectContaining({
        date: "2026-11-17",
        currency: "USD",
        spendMinor: 16557,
      }),
    ]);
  });

  it("flags stale data and keeps the old rows when Meta fails", async () => {
    const context = await setup();
    mockMeta(context);
    await call(metricsPath(context.wid), { as: context.owner });
    await env.DB.prepare("UPDATE insights_cache SET expires_at = 0").run();
    server.use(
      metaFails(`${context.asset.metaId}/insights`, paramFixture, 400),
    );

    const body = await rowsOf(
      await call(metricsPath(context.wid), { as: context.owner }),
    );

    expect(body.stale).toBe(true);
    expect(body.data).toHaveLength(3);
  });

  it("adds product, protection and scale age to rows", async () => {
    const context = await setup();
    mockMeta(context);
    const product = await createProduct(context.wid);
    await createLaunch(context.wid, {
      metaCampaignId: WINNER,
      productId: product.id,
    });
    await db.insert(protectedCampaigns).values({
      workspaceId: context.wid,
      campaignMetaId: WINNER,
      adAccountMetaId: context.asset.metaId,
      createdAt: Date.now(),
    });
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      workspaceId: context.wid,
      actorType: "user",
      origin: "manual",
      action: "meta.budget.scale",
      objectMetaId: WINNER,
      result: "ok",
      createdAt: Date.now() - 5 * HOUR_MS,
    });

    const body = await rowsOf(
      await call(metricsPath(context.wid, "", `productId=${product.id}`), {
        as: context.owner,
      }),
    );

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: WINNER,
      productId: product.id,
      protected: true,
      scaledHoursAgo: 5,
    });
  });
});

describe("GET /api/w/:wid/metrics/export.csv", () => {
  const evilName = '=HYPERLINK("http://evil.test","click")';
  const evilCampaigns = {
    data: [
      {
        campaign_id: WINNER,
        campaign_name: evilName,
        spend: "10.00",
        impressions: "1000",
        clicks: "10",
        date_start: "2026-11-17",
        date_stop: "2026-11-17",
      },
    ],
  };

  it("escapes cells that start with a formula character", async () => {
    const context = await setup();
    mockMeta(context, { campaign: evilCampaigns });

    const response = await call(metricsPath(context.wid, "/export.csv"), {
      as: context.owner,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const lines = (await response.text()).trim().split("\r\n");
    expect(lines[0]).toBe(
      "id,name,level,status,adAccountId,currency,spendMinor,purchases,purchaseValueMinor,roas,cpaMinor,ctr,cpmMinor",
    );
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil.test"",""click"")"`);
    expect(lines[1]).not.toContain(`,${evilName},`);
  });

  it("answers 429 when the expensive limiter is exhausted", async () => {
    const { wid, owner } = await setup();

    const response = await call(metricsPath(wid, "/export.csv"), {
      as: owner,
      env: { RL_EXP: blockedLimiter },
    });

    await expectError(response, 429, "RATE_LIMITED");
  });

  it("answers 422 RANGE_INVALID for an invalid range", async () => {
    const { wid, owner } = await setup();

    const response = await call(
      metricsPath(
        wid,
        "/export.csv",
        "range=custom&from=2024-12-01&to=2026-01-05",
      ),
      { as: owner },
    );

    await expectError(response, 422, "RANGE_INVALID");
  });
});

describe("POST /api/w/:wid/metrics/refresh", () => {
  it("refreshes, then answers 429 for a second refresh within 60 seconds", async () => {
    const context = await setup();
    mockMeta(context);
    const refresh = () =>
      call(metricsPath(context.wid, "/refresh"), {
        as: context.owner,
        method: "POST",
      });

    const first = await refresh();
    const second = await refresh();

    expect(first.status).toBe(200);
    expect(
      refreshMetricsResponseSchema.parse(await first.json()),
    ).toBeDefined();
    await expectError(second, 429, "RATE_LIMITED");
  });

  it("forces a read from Meta even when the cache is fresh", async () => {
    const context = await setup();
    const insights = mockMeta(context);
    await call(metricsPath(context.wid), { as: context.owner });
    const callsBefore = insights.calls;

    const response = await call(metricsPath(context.wid, "/refresh"), {
      as: context.owner,
      method: "POST",
      body: { range: "last_7d" },
    });

    expect(response.status).toBe(200);
    expect(insights.calls).toBeGreaterThan(callsBefore);
  });

  it("answers 422 RANGE_INVALID without spending the cooldown", async () => {
    const context = await setup();
    mockMeta(context);
    const refresh = (body: unknown) =>
      call(metricsPath(context.wid, "/refresh"), {
        as: context.owner,
        method: "POST",
        body,
      });

    const invalid = await refresh({
      range: "custom",
      from: "2024-12-01",
      to: "2026-01-05",
    });
    const valid = await refresh({});

    await expectError(invalid, 422, "RANGE_INVALID");
    expect(valid.status).toBe(200);
  });
});

describe("GET /api/w/:wid/metrics/top-ads", () => {
  it("ranks ads by ROAS above the minimum spend and adds creative data", async () => {
    const context = await setup();
    mockMeta(context, {
      ad: {
        data: [
          adInsight("7001", "50.00", "100.00"),
          adInsight("7002", "60.00", "300.00"),
          adInsight("7003", "5.00", "500.00"),
        ],
      },
    });
    server.use(
      metaReplies(`${context.asset.metaId}/ads`, {
        data: [
          {
            id: "7002",
            creative: {
              thumbnail_url: "https://scontent.fbcdn.net/t.jpg",
              effective_object_story_id: "55_7002",
            },
          },
        ],
      }),
    );

    const response = await call(
      metricsPath(context.wid, "/top-ads", "minSpendMinor=1000"),
      { as: context.owner },
    );

    expect(response.status).toBe(200);
    const body = topAdsResponseSchema.parse(await response.json());
    expect(body.data.map(({ adId }) => adId)).toEqual(["7002", "7001"]);
    expect(body.data[0]).toMatchObject({
      adAccountId: context.asset.id,
      storyId: "55_7002",
      thumbnailUrl: "https://scontent.fbcdn.net/t.jpg",
      roas: 5,
    });
    expect(body.data[1]).toMatchObject({ storyId: null, thumbnailUrl: null });
  });

  it("answers 400 for a limit above the maximum", async () => {
    const { wid, owner } = await setup();

    const response = await call(metricsPath(wid, "/top-ads", "limit=500"), {
      as: owner,
    });

    await expectError(response, 400, "VALIDATION");
  });
});

describe("GET /api/w/:wid/metrics/winning-tags", () => {
  async function linkAd(
    context: Setup,
    metaAdId: string,
    tags: { tagHook: string; tagFormat: "ugc" | "demo" },
  ) {
    const creative = await createCreative(context.wid, context.asset.id, tags);
    const launch = await createLaunch(context.wid);
    await db.insert(launchItems).values({
      id: crypto.randomUUID(),
      workspaceId: context.wid,
      launchId: launch.id,
      position: 1,
      source: "upload",
      creativeId: creative.id,
      adName: `Anuncio ${metaAdId}`,
      metaAdId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  it("groups ROAS and CPA by the tag of the creative behind each ad", async () => {
    const context = await setup();
    mockMeta(context, {
      ad: {
        data: [
          adInsight("7001", "50.00", "100.00"),
          adInsight("7002", "50.00", "300.00"),
          adInsight("7003", "50.00", "150.00"),
          adInsight("7004", "50.00", "999.00"),
        ],
      },
    });
    await linkAd(context, "7001", { tagHook: "Dolor", tagFormat: "ugc" });
    await linkAd(context, "7002", { tagHook: "Dolor", tagFormat: "ugc" });
    await linkAd(context, "7003", { tagHook: "Prueba", tagFormat: "demo" });

    const response = await call(
      metricsPath(context.wid, "/winning-tags", "dimension=hook"),
      { as: context.owner },
    );

    expect(response.status).toBe(200);
    const body = winningTagsResponseSchema.parse(await response.json());
    expect(body.data).toEqual([
      {
        tag: "Dolor",
        currency: "USD",
        ads: 2,
        spendMinor: 10000,
        purchases: 4,
        roas: 4,
        cpaMinor: 2500,
      },
      {
        tag: "Prueba",
        currency: "USD",
        ads: 1,
        spendMinor: 5000,
        purchases: 2,
        roas: 3,
        cpaMinor: 2500,
      },
    ]);
  });

  it("does not use creatives of another workspace", async () => {
    const mine = await setup();
    const theirs = await setup();
    mockMeta(mine, { ad: { data: [adInsight("7001", "50.00", "100.00")] } });
    await linkAd(theirs, "7001", { tagHook: "Ajeno", tagFormat: "ugc" });

    const response = await call(
      metricsPath(mine.wid, "/winning-tags", "dimension=hook"),
      { as: mine.owner },
    );

    expect(winningTagsResponseSchema.parse(await response.json()).data).toEqual(
      [],
    );
  });

  it("answers 400 without a dimension", async () => {
    const { wid, owner } = await setup();

    const response = await call(metricsPath(wid, "/winning-tags"), {
      as: owner,
    });

    await expectError(response, 400, "VALIDATION");
  });
});
