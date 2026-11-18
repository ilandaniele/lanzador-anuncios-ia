import { describe, expect, it } from "vitest";
import type { BatchRequest } from "../../../src/api/integrations/meta/batch";
import type { Graph } from "../../../src/api/integrations/meta/client";
import { activateBatch } from "../../../src/api/integrations/meta/write";
import { AppError } from "../../../src/api/lib/errors";
import {
  type AdsetDraft,
  type AdsetReference,
  buildAdPayload,
  buildAdsetPayload,
  buildCampaignPayload,
  buildCreativePayload,
  type CampaignDraft,
  cleanTargeting,
  type CreativeItem,
  type PayloadSettings,
} from "../../../src/api/services/launch/payloads";

const settings: PayloadSettings = {
  maxCampaignBudgetMinor: 30000,
  advantageCreativeEnabled: false,
  launchDefaults: {
    objective: "OUTCOME_SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    billingEvent: "IMPRESSIONS",
    attributionSpec: [
      { event_type: "CLICK_THROUGH", window_days: 7 },
      { event_type: "VIEW_THROUGH", window_days: 1 },
    ],
    customEventType: "PURCHASE",
    targeting: { age_min: 18, geo_locations: { countries: ["AR"] } },
  },
};

const campaignDraft: CampaignDraft = {
  campaignName: "CBO 17-11",
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  dailyBudgetMinor: 5000,
};

const adsetDraft: AdsetDraft = {
  mode: "new_cbo",
  campaignId: "120000000000010",
  adsetName: "CONJ 1",
  pixelId: "900000000000001",
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  countries: ["AR", "UY"],
  optimizationEvent: "PURCHASE",
};

const metaTargeting = {
  age_min: 25,
  age_max: 54,
  genders: [2],
  geo_locations: { countries: ["MX"], location_types: ["home"] },
  flexible_spec: [{ interests: [{ id: "6003", name: "Fitness" }] }],
  publisher_platforms: ["facebook", "instagram"],
  targeting_automation: { advantage_audience: 1, individual_setting: {} },
  targeting_optimization: "expansion_all",
  targeting_relaxation_types: { lookalike: 1 },
  brand_safety_content_filter_levels: ["FACEBOOK_STANDARD"],
};

const reference: AdsetReference = {
  campaignBidStrategy: "LOWEST_COST_WITHOUT_CAP",
  optimizationGoal: "OFFSITE_CONVERSIONS",
  billingEvent: "IMPRESSIONS",
  attributionSpec: [{ event_type: "CLICK_THROUGH", window_days: 1 }],
  targeting: metaTargeting,
  customEventType: "PURCHASE",
  bidAmount: 1500,
  bidConstraints: { roas_average_floor: 20000 },
};

const product = {
  landingUrl: "https://tienda.example/producto",
  utm: "?& utm_source=meta&utm_medium=paid",
};

const copy = {
  primaryText: "Dormí mejor desde la primera noche.",
  headline: "Almohada ergonómica",
  description: "Envío gratis",
  cta: "SHOP_NOW" as const,
};

const item: CreativeItem = {
  adName: "hook-ugc-dolor-1",
  pageId: "100000000000001",
  instagramUserId: "170000000000001",
};

const video = {
  kind: "video" as const,
  videoId: "300000000000001",
  thumbnailUrl: "https://scontent.fbcdn.net/thumb.jpg",
};

const story = (storyId: string) => ({ kind: "story" as const, storyId });

const expectAppError = (run: () => unknown, code: string) =>
  expect(run).toThrow(expect.objectContaining({ code }) as unknown as Error);

describe("buildCampaignPayload", () => {
  it("builds a paused CBO campaign", () => {
    expect(buildCampaignPayload(campaignDraft, settings)).toMatchSnapshot();
  });

  it("uses COST_CAP when the draft asks for it", () => {
    expect(
      buildCampaignPayload(
        { ...campaignDraft, bidStrategy: "COST_CAP" },
        settings,
      ).bid_strategy,
    ).toBe("COST_CAP");
  });

  it.each([undefined, 0, 30001])(
    "rejects daily budget %s outside 1..workspace cap",
    (dailyBudgetMinor) => {
      expectAppError(
        () =>
          buildCampaignPayload(
            { ...campaignDraft, dailyBudgetMinor },
            settings,
          ),
        "BUDGET_CAP",
      );
    },
  );
});

describe("cleanTargeting", () => {
  it("keeps only whitelisted fields and advantage_audience", () => {
    expect(cleanTargeting(metaTargeting)).toMatchSnapshot();
  });

  it("drops targeting_automation without advantage_audience", () => {
    expect(
      cleanTargeting({ age_min: 18, targeting_automation: { other: 1 } }),
    ).toEqual({ age_min: 18 });
  });
});

describe("buildAdsetPayload", () => {
  it("builds a new_cbo adset from workspace defaults and draft countries", () => {
    expect(
      buildAdsetPayload(adsetDraft, undefined, settings),
    ).toMatchSnapshot();
  });

  it("adds bid_amount for COST_CAP in new_cbo", () => {
    expect(
      buildAdsetPayload(
        { ...adsetDraft, bidStrategy: "COST_CAP", bidAmountMinor: 1200 },
        undefined,
        settings,
      ).bid_amount,
    ).toBe(1200);
  });

  it("copies the reference adset in existing_cbo", () => {
    expect(
      buildAdsetPayload(
        { ...adsetDraft, mode: "existing_cbo" },
        reference,
        settings,
      ),
    ).toMatchSnapshot();
  });

  it.each([
    ["COST_CAP", { bid_amount: 1500 }],
    ["LOWEST_COST_WITH_BID_CAP", { bid_amount: 1500 }],
    [
      "LOWEST_COST_WITH_MIN_ROAS",
      { bid_constraints: reference.bidConstraints },
    ],
  ])("copies the bid of a %s campaign", (campaignBidStrategy, bid) => {
    expect(
      buildAdsetPayload(
        { ...adsetDraft, mode: "existing_cbo" },
        { ...reference, campaignBidStrategy },
        settings,
      ),
    ).toMatchObject(bid);
  });

  it("requires a reference adset in existing_cbo", () => {
    expectAppError(
      () =>
        buildAdsetPayload(
          { ...adsetDraft, mode: "existing_cbo" },
          undefined,
          settings,
        ),
      "NO_REFERENCE_ADSET",
    );
  });

  it("requires the reference bid the campaign strategy needs", () => {
    expectAppError(
      () =>
        buildAdsetPayload(
          { ...adsetDraft, mode: "existing_cbo" },
          {
            ...reference,
            campaignBidStrategy: "COST_CAP",
            bidAmount: undefined,
          },
          settings,
        ),
      "NO_REFERENCE_ADSET",
    );
  });
});

describe("buildCreativePayload", () => {
  it("builds a video creative with every feature OPT_OUT", () => {
    const payload = buildCreativePayload(item, product, copy, video, settings);
    expect(payload).toMatchSnapshot();
    expect(JSON.stringify(payload)).not.toContain("standard_enhancements");
    expect(JSON.stringify(payload)).not.toContain("OPT_IN");
  });

  it("builds an image creative without instagram or utm", () => {
    expect(
      buildCreativePayload(
        { ...item, instagramUserId: undefined },
        { ...product, utm: null },
        copy,
        { kind: "image", imageHash: "abc123" },
        settings,
      ),
    ).toMatchSnapshot();
  });

  it("opts features in when the workspace enables enhancements", () => {
    const payload = buildCreativePayload(item, product, copy, video, {
      ...settings,
      advantageCreativeEnabled: true,
    });
    const features = Object.values(
      payload.degrees_of_freedom_spec.creative_features_spec,
    );
    expect(features.every((f) => f.enroll_status === "OPT_IN")).toBe(true);
    expect(payload.contextual_multi_ads).toEqual({ enroll_status: "OPT_OUT" });
    expect(JSON.stringify(payload)).not.toContain("standard_enhancements");
  });

  it("builds a cloned creative from a post of the chosen page", () => {
    expect(
      buildCreativePayload(
        item,
        product,
        copy,
        story(`${item.pageId}_555`),
        settings,
      ),
    ).toMatchSnapshot();
  });

  it("rejects a post from another page", () => {
    const run = () =>
      buildCreativePayload(
        item,
        product,
        copy,
        story("999999999999999_555"),
        settings,
      );
    expect(run).toThrow(AppError);
    expect(run).toThrow(/publicación de otra página/);
  });
});

describe("buildAdPayload", () => {
  it("builds a paused ad with pixel tracking specs", () => {
    expect(
      buildAdPayload({
        adName: item.adName,
        adsetId: "120000000000020",
        creativeId: "120000000000030",
        pixelId: adsetDraft.pixelId,
      }),
    ).toMatchSnapshot();
  });
});

describe("activation batch", () => {
  it("activates campaign, adset and ads with start_time on the adset", async () => {
    const sent: BatchRequest[] = [];
    const graph = {
      batch: async (requests: BatchRequest[]) => {
        sent.push(...requests);
        return [];
      },
    } as unknown as Graph;

    await activateBatch(
      graph,
      [
        { id: "120000000000010", kind: "campaign" },
        { id: "120000000000020", kind: "adset" },
        { id: "120000000000040", kind: "ad" },
      ],
      "2026-12-01T03:00:00.000Z",
    );

    expect(sent).toMatchSnapshot();
  });
});
