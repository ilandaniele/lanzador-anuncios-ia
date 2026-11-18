import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { metaAssets } from "../../../src/db/schema/meta";
import {
  adPreviewSchema,
  campaignAdsResponseSchema,
} from "../../../src/shared/schemas/meta-campaigns";
import {
  api,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import { GRAPH_VERSION, metaFails, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABadsRouteToken654";
const CAMPAIGN_ID = "120200000000000100";
const AD_ID = "120200000000000200";
const PREVIEW_URL =
  "https://www.facebook.com/ads/api/preview_iframe.php?d=abc&t=def";

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

async function setup(assetOverrides = {}) {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(
    workspace.id,
    connection.id,
    assetOverrides,
  );
  return { wid: workspace.id, owner, asset };
}

const accountNumber = (metaId: string) => metaId.replace(/^act_/, "");

const adsPath = (wid: string, assetId: string, query = "") =>
  `/api/w/${wid}/meta/campaigns/${CAMPAIGN_ID}/ads?adAccountAssetId=${assetId}${query}`;

const previewPath = (wid: string, assetId: string, adId = AD_ID) =>
  `/api/w/${wid}/meta/ads/${adId}/preview?adAccountAssetId=${assetId}`;

const metaAd = (index: number) => ({
  id: `1202000000${String(index).padStart(8, "0")}`,
  name: `Anuncio ${index}`,
  effective_status: "ACTIVE",
  creative: {
    thumbnail_url: `https://scontent.fbcdn.net/t${index}.jpg`,
    effective_object_story_id: `55_${index}`,
  },
});

const metaCampaignAds = (accountId: string, ads: unknown[], paging = {}) => ({
  id: CAMPAIGN_ID,
  account_id: accountId,
  ads: { data: ads, ...paging },
});

const insightRow = (adId: string) => ({
  ad_id: adId,
  ad_name: "x",
  date_start: "2026-11-01",
  spend: "50.25",
  impressions: "1000",
  clicks: "20",
  actions: [{ action_type: "omni_purchase", value: "3" }],
  action_values: [{ action_type: "omni_purchase", value: "150.75" }],
});

const iframe = (src: string) =>
  `<iframe src="${src}" width="540" height="690"></iframe>`;

const metaPreview = (accountId: string, body: string) => ({
  id: AD_ID,
  account_id: accountId,
  previews: { data: [{ body }] },
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe("GET /api/w/:wid/meta/campaigns/:campaignId/ads", () => {
  it("lists ads with spend, purchases and ROAS from insights", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        CAMPAIGN_ID,
        metaCampaignAds(accountNumber(asset.metaId), [
          metaAd(1),
          { id: "77", name: "Sin datos", effective_status: "PAUSED" },
        ]),
      ),
      metaReplies(`${CAMPAIGN_ID}/insights`, {
        data: [insightRow(metaAd(1).id)],
      }),
    );
    const requests = captureRequests();

    const response = await call(adsPath(wid, asset.id, "&range=last_14d"), {
      as: owner,
    });

    expect(response.status).toBe(200);
    expect(campaignAdsResponseSchema.parse(await response.json())).toEqual({
      data: [
        {
          adId: metaAd(1).id,
          name: "Anuncio 1",
          storyId: "55_1",
          thumbnailUrl: "https://scontent.fbcdn.net/t1.jpg",
          effectiveStatus: "ACTIVE",
          spendMinor: 5025,
          purchases: 3,
          roas: 3,
        },
        {
          adId: "77",
          name: "Sin datos",
          storyId: null,
          thumbnailUrl: null,
          effectiveStatus: "PAUSED",
          spendMinor: 0,
          purchases: 0,
          roas: null,
        },
      ],
      truncated: false,
    });
    const insightsUrl = new URL(
      requests.find(({ url }) => url.includes("/insights"))!.url,
    );
    expect(insightsUrl.searchParams.get("level")).toBe("ad");
    expect(requests[0]!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("flags the truncation past 200 ads and returns only 200", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        CAMPAIGN_ID,
        metaCampaignAds(
          accountNumber(asset.metaId),
          Array.from({ length: 201 }, (_, index) => metaAd(index)),
        ),
      ),
      metaReplies(`${CAMPAIGN_ID}/insights`, { data: [] }),
    );

    const response = await call(adsPath(wid, asset.id), { as: owner });

    const body = campaignAdsResponseSchema.parse(await response.json());
    expect(body.data).toHaveLength(200);
    expect(body.truncated).toBe(true);
  });

  it("flags the truncation when Meta reports a next page", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        CAMPAIGN_ID,
        metaCampaignAds(accountNumber(asset.metaId), [metaAd(1)], {
          paging: { next: "https://graph.facebook.com/next" },
        }),
      ),
      metaReplies(`${CAMPAIGN_ID}/insights`, { data: [] }),
    );

    const response = await call(adsPath(wid, asset.id), { as: owner });

    expect(
      campaignAdsResponseSchema.parse(await response.json()).truncated,
    ).toBe(true);
  });

  it("returns 404 for a campaign of another ad account", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(CAMPAIGN_ID, metaCampaignAds("424242424242", [metaAd(1)])),
      metaReplies(`${CAMPAIGN_ID}/insights`, { data: [] }),
    );

    await expectError(
      await call(adsPath(wid, asset.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for a disabled asset without calling Meta", async () => {
    const { wid, owner, asset } = await setup();
    await db
      .update(metaAssets)
      .set({ enabled: 0 })
      .where(eq(metaAssets.id, asset.id));
    const requests = captureRequests();

    await expectError(
      await call(adsPath(wid, asset.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
    expect(requests).toHaveLength(0);
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();

    await expectError(
      await call(adsPath(other.workspace.id, asset.id), { as: other.owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for a campaign id that is not a Meta id", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(
        `/api/w/${wid}/meta/campaigns/act_1/ads?adAccountAssetId=${asset.id}`,
        { as: owner },
      ),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 400 without adAccountAssetId", async () => {
    const { wid, owner } = await setup();

    await expectError(
      await call(`/api/w/${wid}/meta/campaigns/${CAMPAIGN_ID}/ads`, {
        as: owner,
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 400 for an unknown range or a custom range without dates", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(adsPath(wid, asset.id, "&range=forever"), { as: owner }),
      400,
      "VALIDATION",
    );
    await expectError(
      await call(adsPath(wid, asset.id, "&range=custom"), { as: owner }),
      400,
      "VALIDATION",
    );
  });

  it("returns 422 RANGE_INVALID for a custom range in the future", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        CAMPAIGN_ID,
        metaCampaignAds(accountNumber(asset.metaId), [metaAd(1)]),
      ),
      metaReplies(`${CAMPAIGN_ID}/insights`, { data: [] }),
    );

    await expectError(
      await call(
        adsPath(wid, asset.id, "&range=custom&from=2999-01-01&to=2999-01-02"),
        { as: owner },
      ),
      422,
      "RANGE_INVALID",
    );
  });

  it("returns 502 META_ERROR when the asset has no currency", async () => {
    const { wid, owner, asset } = await setup({ currency: null });

    await expectError(
      await call(adsPath(wid, asset.id), { as: owner }),
      502,
      "META_ERROR",
    );
  });

  it("returns 502 META_ERROR on Meta errors", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaFails(CAMPAIGN_ID, { error: { code: 100, message: "bad" } }),
      metaReplies(`${CAMPAIGN_ID}/insights`, { data: [] }),
    );

    await expectError(
      await call(adsPath(wid, asset.id), { as: owner }),
      502,
      "META_ERROR",
    );
  });
});

describe("GET /api/w/:wid/meta/ads/:adId/preview", () => {
  it("returns only the iframe src, never the HTML", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        AD_ID,
        metaPreview(
          accountNumber(asset.metaId),
          iframe(PREVIEW_URL.replace("&", "&amp;")),
        ),
      ),
    );

    const response = await call(previewPath(wid, asset.id), { as: owner });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(adPreviewSchema.parse(JSON.parse(text))).toEqual({
      iframeSrc: PREVIEW_URL,
    });
    expect(text).not.toContain("<iframe");
  });

  it("accepts the bare facebook.com host", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        AD_ID,
        metaPreview(
          accountNumber(asset.metaId),
          iframe("https://facebook.com/ads/p"),
        ),
      ),
    );

    const response = await call(previewPath(wid, asset.id), { as: owner });

    expect(adPreviewSchema.parse(await response.json()).iframeSrc).toBe(
      "https://facebook.com/ads/p",
    );
  });

  it.each([
    ["another host", "https://evil.test/p"],
    ["a lookalike suffix", "https://facebook.com.evil.test/p"],
    ["a lookalike prefix", "https://evilfacebook.com/p"],
    ["userinfo spoofing", "https://facebook.com@evil.test/p"],
    ["a subdomain", "https://m.facebook.com/p"],
    ["a custom port", "https://facebook.com:8443/p"],
    ["plain http", "http://www.facebook.com/p"],
    ["a protocol-relative url", "//www.facebook.com/p"],
    ["a javascript url", "javascript:alert(1)"],
  ])("returns 502 META_ERROR for %s", async (_label, src) => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(AD_ID, metaPreview(accountNumber(asset.metaId), iframe(src))),
    );

    const response = await call(previewPath(wid, asset.id), { as: owner });

    await expectError(response, 502, "META_ERROR");
  });

  it("returns 502 META_ERROR when the body has no iframe src", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(
        AD_ID,
        metaPreview(accountNumber(asset.metaId), "<div>no frame</div>"),
      ),
    );

    await expectError(
      await call(previewPath(wid, asset.id), { as: owner }),
      502,
      "META_ERROR",
    );
  });

  it("returns 502 META_ERROR when Meta returns no preview", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(AD_ID, {
        id: AD_ID,
        account_id: accountNumber(asset.metaId),
        previews: { data: [] },
      }),
    );

    await expectError(
      await call(previewPath(wid, asset.id), { as: owner }),
      502,
      "META_ERROR",
    );
  });

  it("returns 404 for an ad of another ad account", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaReplies(AD_ID, metaPreview("424242424242", iframe(PREVIEW_URL))),
    );

    await expectError(
      await call(previewPath(wid, asset.id), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an ad id that is not a Meta id", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(previewPath(wid, asset.id, "abc"), { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();

    await expectError(
      await call(previewPath(other.workspace.id, asset.id), {
        as: other.owner,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 409 META_RECONNECT_REQUIRED on a session error", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      metaFails(AD_ID, {
        error: { code: 190, error_subcode: 463, message: "expired" },
      }),
    );

    await expectError(
      await call(previewPath(wid, asset.id), { as: owner }),
      409,
      "META_RECONNECT_REQUIRED",
    );
  });
});
