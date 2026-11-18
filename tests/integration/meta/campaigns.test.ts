import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { metaAssets } from "../../../src/db/schema/meta";
import {
  campaignReferenceSchema,
  campaignsResponseSchema,
} from "../../../src/shared/schemas/meta-campaigns";
import sessionFixture from "../../fixtures/meta/error-session.json";
import {
  api,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import {
  GRAPH_VERSION,
  metaEdgePages,
  metaFails,
  metaReplies,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABcampaignsRouteToken987";
const CAMPAIGN_ID = "120200000000000100";

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

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: routeEnv, ...options });

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { wid: workspace.id, owner, connection, asset };
}

const accountNumber = (metaId: string) => metaId.replace(/^act_/, "");

const campaignsPath = (wid: string, assetId: string, query = "") =>
  `/api/w/${wid}/meta/ad-accounts/${assetId}/campaigns${query}`;

const referencePath = (
  wid: string,
  assetId: string,
  campaignId = CAMPAIGN_ID,
) =>
  `/api/w/${wid}/meta/campaigns/${campaignId}/reference?adAccountAssetId=${assetId}`;

const disable = (assetId: string) =>
  db.update(metaAssets).set({ enabled: 0 }).where(eq(metaAssets.id, assetId));

const metaCampaign = (index: number) => ({
  id: `1202000000${String(index).padStart(8, "0")}`,
  name: `Campaña ${index}`,
  effective_status: "ACTIVE",
  daily_budget: "5000",
  objective: "OUTCOME_SALES",
  bid_strategy: "LOWEST_COST_WITHOUT_CAP",
});

const adset = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `CONJ ${id}`,
  effective_status: "ACTIVE",
  optimization_goal: "OFFSITE_CONVERSIONS",
  bid_amount: 1500,
  promoted_object: { pixel_id: "555", custom_event_type: "PURCHASE" },
  targeting: { geo_locations: { countries: ["AR", "UY"] } },
  ...overrides,
});

const metaReference = (
  accountId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: CAMPAIGN_ID,
  account_id: accountId,
  daily_budget: "8000",
  bid_strategy: "COST_CAP",
  adsets: {
    data: [
      adset("120200000000000201"),
      adset("120200000000000999", {
        name: "Borrado",
        effective_status: "DELETED",
      }),
      adset("120200000000000300", { name: "Nuevo" }),
      adset("99999999999999999", { name: "Viejo" }),
    ],
  },
  ...overrides,
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe("GET /api/w/:wid/meta/ad-accounts/:assetId/campaigns", () => {
  it("lists campaigns of the ad account filtered by status", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(`${asset.metaId}/campaigns`, {
        data: [
          metaCampaign(1),
          { id: "77", name: "ABO", effective_status: "PAUSED" },
        ],
      }),
    );
    const requests = captureRequests();

    const response = await call(
      campaignsPath(wid, asset.id, "?status=PAUSED,ACTIVE"),
      { as: owner },
    );

    expect(response.status).toBe(200);
    expect(campaignsResponseSchema.parse(await response.json())).toEqual({
      data: [
        {
          id: metaCampaign(1).id,
          name: "Campaña 1",
          effectiveStatus: "ACTIVE",
          dailyBudgetMinor: 5000,
          objective: "OUTCOME_SALES",
          bidStrategy: "LOWEST_COST_WITHOUT_CAP",
          isCbo: true,
        },
        {
          id: "77",
          name: "ABO",
          effectiveStatus: "PAUSED",
          dailyBudgetMinor: null,
          objective: null,
          bidStrategy: null,
          isCbo: false,
        },
      ],
      truncated: false,
    });
    const url = new URL(requests[0]!.url);
    expect(JSON.parse(url.searchParams.get("filtering")!)).toEqual([
      {
        field: "effective_status",
        operator: "IN",
        value: ["ACTIVE", "PAUSED"],
      },
    ]);
    expect(requests[0]!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("serves the second read from the cache", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(`${asset.metaId}/campaigns`, { data: [metaCampaign(1)] }),
    );
    const requests = captureRequests();

    const first = await call(campaignsPath(wid, asset.id), { as: owner });
    const second = await call(campaignsPath(wid, asset.id), { as: owner });

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(requests).toHaveLength(1);
  });

  it("caps the list at 300 and flags the truncation", async () => {
    const { wid, owner, asset } = await setup();
    const page = (index: number) => ({
      data: Array.from({ length: 100 }, (_, offset) =>
        metaCampaign(index * 100 + offset),
      ),
      paging: { cursors: { after: `cursor_${index + 1}` } },
    });
    server.use(
      metaEdgePages(`${asset.metaId}/campaigns`, [0, 1, 2, 3].map(page)),
    );

    const response = await call(campaignsPath(wid, asset.id), { as: owner });

    const body = campaignsResponseSchema.parse(await response.json());
    expect(body.data).toHaveLength(300);
    expect(body.truncated).toBe(true);
  });

  it("returns 404 for a disabled asset, even with a cached list", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(`${asset.metaId}/campaigns`, { data: [metaCampaign(1)] }),
    );
    expect(
      (await call(campaignsPath(wid, asset.id), { as: owner })).status,
    ).toBe(200);
    await disable(asset.id);

    await expectError(
      await call(campaignsPath(wid, asset.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();

    await expectError(
      await call(campaignsPath(other.workspace.id, asset.id), {
        as: other.owner,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an asset that is not an ad account", async () => {
    const { wid, owner, connection } = await setup();
    const page = await createMetaAsset(wid, connection.id, { kind: "page" });

    await expectError(
      await call(campaignsPath(wid, page.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 400 for an unknown status", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(campaignsPath(wid, asset.id, "?status=ACTIVE,DELETED"), {
        as: owner,
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 409 META_RECONNECT_REQUIRED on a session error", async () => {
    const { wid, owner, asset } = await setup();
    server.use(metaFails(`${asset.metaId}/campaigns`, sessionFixture));

    await expectError(
      await call(campaignsPath(wid, asset.id), { as: owner }),
      409,
      "META_RECONNECT_REQUIRED",
    );
  });

  it("returns 502 META_ERROR on other Meta errors", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaFails(`${asset.metaId}/campaigns`, {
        error: { code: 100, message: "bad" },
      }),
    );

    await expectError(
      await call(campaignsPath(wid, asset.id), { as: owner }),
      502,
      "META_ERROR",
    );
  });
});

describe("GET /api/w/:wid/meta/campaigns/:campaignId/reference", () => {
  it("returns the newest live adset and the next adset number", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(CAMPAIGN_ID, metaReference(accountNumber(asset.metaId))),
    );

    const response = await call(referencePath(wid, asset.id), { as: owner });

    expect(response.status).toBe(200);
    expect(campaignReferenceSchema.parse(await response.json())).toEqual({
      adsetName: "Nuevo",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      customEventType: "PURCHASE",
      pixelId: "555",
      bidStrategy: "COST_CAP",
      bidAmountMinor: 1500,
      countries: ["AR", "UY"],
      dailyBudgetMinor: 8000,
      nextAdsetNumber: 4,
    });
  });

  it("returns 404 for a campaign of another ad account", async () => {
    const { wid, owner, asset } = await setup();
    server.use(metaReplies(CAMPAIGN_ID, metaReference("424242424242")));

    await expectError(
      await call(referencePath(wid, asset.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for a disabled asset without calling Meta", async () => {
    const { wid, owner, asset } = await setup();
    await disable(asset.id);
    const requests = captureRequests();

    await expectError(
      await call(referencePath(wid, asset.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
    expect(requests).toHaveLength(0);
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();

    await expectError(
      await call(referencePath(other.workspace.id, asset.id), {
        as: other.owner,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for a campaign id that is not a Meta id", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(referencePath(wid, asset.id, "act_1"), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 422 NOT_CBO for a campaign without a daily budget", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        CAMPAIGN_ID,
        metaReference(accountNumber(asset.metaId), { daily_budget: undefined }),
      ),
    );

    await expectError(
      await call(referencePath(wid, asset.id), { as: owner }),
      422,
      "NOT_CBO",
    );
  });

  it("returns 422 NO_REFERENCE_ADSET when no live adset exists", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        CAMPAIGN_ID,
        metaReference(accountNumber(asset.metaId), {
          adsets: { data: [adset("1", { effective_status: "ARCHIVED" })] },
        }),
      ),
    );

    await expectError(
      await call(referencePath(wid, asset.id), { as: owner }),
      422,
      "NO_REFERENCE_ADSET",
    );
  });

  it("returns 400 without adAccountAssetId", async () => {
    const { wid, owner } = await setup();

    await expectError(
      await call(`/api/w/${wid}/meta/campaigns/${CAMPAIGN_ID}/reference`, {
        as: owner,
      }),
      400,
      "VALIDATION",
    );
  });
});
