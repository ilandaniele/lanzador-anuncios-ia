import type { WorkflowStep } from "cloudflare:workers";
import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Env } from "../../../src/api/env";
import {
  type InsightsCacheKey,
  readCachedInsights,
} from "../../../src/api/repositories/insights-cache";
import type { Scope } from "../../../src/api/repositories/scope";
import { refreshInsights } from "../../../src/api/services/insights/refresh";
import { JOB_HANDLERS } from "../../../src/workflows/jobs";
import accountFixture from "../../fixtures/insights/account.json";
import campaignFixture from "../../fixtures/insights/campaign.json";
import healthFixture from "../../fixtures/insights/health.json";
import paramFixture from "../../fixtures/meta/error-param.json";
import {
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
} from "../../helpers/factory";
import {
  GRAPH_VERSION,
  graphUrl,
  metaFails,
  metaReplies,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const TOKEN = "EAABinsightsRefreshToken321";
const AT = Date.parse("2026-11-17T15:00:00Z");
const MINUTE_MS = 60_000;

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const refreshEnv = {
  ...env,
  ...keyEnv,
  GRAPH_API_VERSION: GRAPH_VERSION,
  META_APP_SECRET: "test-app-secret",
} as Env;

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  const scope: Scope = {
    workspaceId: workspace.id,
    userId: owner.id,
    role: "owner",
  };
  const key: InsightsCacheKey = {
    adAccountAssetId: asset.id,
    level: "campaign",
    rangeKey: "today",
  };
  return { scope, asset, key };
}

const countedReplies = (path: string, body: object) => {
  const counter = { calls: 0 };
  server.use(
    http.get(graphUrl(path), () => {
      counter.calls++;
      return HttpResponse.json(body);
    }),
  );
  return counter;
};

const readOne = async (scope: Scope, key: InsightsCacheKey, at: number) => {
  const [entry] = await readCachedInsights(
    env.DB,
    scope,
    {
      adAccountAssetIds: [key.adAccountAssetId],
      levels: [key.level],
      rangeKeys: [key.rangeKey],
    },
    at,
  );
  return entry;
};

const cacheTimes = (key: InsightsCacheKey) =>
  env.DB.prepare(
    "SELECT expires_at, refreshing_until FROM insights_cache WHERE ad_account_asset_id = ? AND level = ? AND range_key = ?",
  )
    .bind(key.adAccountAssetId, key.level, key.rangeKey)
    .first<{ expires_at: number; refreshing_until: number | null }>();

describe("refreshInsights", () => {
  it("reads Meta once when two refreshes run at the same time", async () => {
    const { scope, asset, key } = await setup();
    const insights = countedReplies(
      `${asset.metaId}/insights`,
      campaignFixture,
    );

    const results = await Promise.all([
      refreshInsights(refreshEnv, scope, key, AT),
      refreshInsights(refreshEnv, scope, key, AT),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(insights.calls).toBe(1);
    const entry = await readOne(scope, key, AT);
    expect(entry).toMatchObject({
      dateFrom: "2026-11-17",
      dateTo: "2026-11-17",
      updatedAt: AT,
      stale: false,
      lastError: null,
    });
    expect(entry?.rows).toHaveLength(campaignFixture.data.length);
  });

  it("keeps the old blob with last_error when Meta fails", async () => {
    const { scope, asset, key } = await setup();
    countedReplies(`${asset.metaId}/insights`, campaignFixture);
    await refreshInsights(refreshEnv, scope, key, AT);
    const later = AT + 16 * MINUTE_MS;
    server.use(metaFails(`${asset.metaId}/insights`, paramFixture));

    await expect(
      refreshInsights(refreshEnv, scope, key, later),
    ).rejects.toMatchObject({ code: "META_ERROR" });

    const entry = await readOne(scope, key, later);
    expect(entry).toMatchObject({
      updatedAt: AT,
      stale: true,
      lastError: "META_ERROR",
    });
    expect(entry?.rows).toHaveLength(campaignFixture.data.length);
    expect((await cacheTimes(key))?.refreshing_until).toBeNull();
  });

  it("skips Meta while the blob is fresh", async () => {
    const { scope, asset, key } = await setup();
    const insights = countedReplies(
      `${asset.metaId}/insights`,
      campaignFixture,
    );
    await refreshInsights(refreshEnv, scope, key, AT);

    const refreshed = await refreshInsights(
      refreshEnv,
      scope,
      key,
      AT + 14 * MINUTE_MS,
    );

    expect(refreshed).toBe(false);
    expect(insights.calls).toBe(1);
  });

  it("expires in 15 minutes when the range includes today, else 6 hours", async () => {
    const { scope, asset, key } = await setup();
    countedReplies(`${asset.metaId}/insights`, campaignFixture);
    const yesterday = { ...key, rangeKey: "yesterday" };

    await refreshInsights(refreshEnv, scope, key, AT);
    await refreshInsights(refreshEnv, scope, yesterday, AT);

    expect((await cacheTimes(key))?.expires_at).toBe(AT + 15 * MINUTE_MS);
    expect((await cacheTimes(yesterday))?.expires_at).toBe(
      AT + 6 * 60 * MINUTE_MS,
    );
  });

  it("does not read a never-fetched lease row", async () => {
    const { scope, asset, key } = await setup();
    server.use(metaFails(`${asset.metaId}/insights`, paramFixture));

    await expect(refreshInsights(refreshEnv, scope, key, AT)).rejects.toThrow();

    expect(await readOne(scope, key, AT)).toBeUndefined();
  });

  it("rejects an ad account from another workspace", async () => {
    const { key } = await setup();
    const other = await setup();

    await expect(
      refreshInsights(refreshEnv, other.scope, key, AT),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid range key", async () => {
    const { scope, key } = await setup();

    await expect(
      refreshInsights(refreshEnv, scope, { ...key, rangeKey: "forever" }, AT),
    ).rejects.toThrow("RANGE_INVALID");
  });
});

describe("insights_refresh job", () => {
  const step = {
    do: (_name: string, _config: unknown, run: () => Promise<unknown>) => run(),
  } as unknown as WorkflowStep;

  const runJob = (workspaceId: string, payload = {}) =>
    JOB_HANDLERS.insights_refresh!({
      env: refreshEnv,
      step,
      key: workspaceId,
      workspaceId,
      payload,
    });

  it("prewarms today for account, campaign and health of enabled accounts", async () => {
    const { scope, asset } = await setup();
    server.use(
      http.get(graphUrl(`${asset.metaId}/insights`), ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.get("level") === "account"
            ? accountFixture
            : campaignFixture,
        ),
      ),
      metaReplies(asset.metaId, healthFixture),
    );

    await runJob(scope.workspaceId);

    const entries = await readCachedInsights(
      env.DB,
      scope,
      {
        adAccountAssetIds: [asset.id],
        levels: ["account", "campaign", "health"],
        rangeKeys: ["today"],
      },
      Date.now(),
    );
    expect(entries.map(({ level }) => level).sort()).toEqual([
      "account",
      "campaign",
      "health",
    ]);
  });

  it("refreshes the other targets and then fails when one target fails", async () => {
    const { scope, asset } = await setup();
    server.use(
      metaFails(`${asset.metaId}/insights`, paramFixture),
      metaReplies(asset.metaId, healthFixture),
    );

    await expect(runJob(scope.workspaceId)).rejects.toMatchObject({
      code: "META_ERROR",
    });

    const entries = await readCachedInsights(
      env.DB,
      scope,
      {
        adAccountAssetIds: [asset.id],
        levels: ["health"],
        rangeKeys: ["today"],
      },
      Date.now(),
    );
    expect(entries).toHaveLength(1);
  });

  it("rejects a job without workspace", async () => {
    await expect(
      JOB_HANDLERS.insights_refresh!({
        env: refreshEnv,
        step,
        key: "none",
        workspaceId: null,
        payload: {},
      }),
    ).rejects.toThrow("Invalid insights_refresh job");
  });
});
