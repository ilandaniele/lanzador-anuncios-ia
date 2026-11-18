import { describe, expect, it } from "vitest";
import type { LaunchObjects } from "../../../src/api/integrations/meta/launch-read";
import {
  buildLaunchChecks,
  type CheckCode,
  type VerifyExpectations,
} from "../../../src/api/services/launch/verify-checks";
import type { LaunchDraft } from "../../../src/shared/schemas/launch";

const LANDING = "https://tienda.example.test/producto";
const NOW = Date.UTC(2026, 10, 18, 12);
const STORY_ID = "page-1_999";

const draft: LaunchDraft = {
  adAccountAssetId: "asset-1",
  pixelId: "pixel-1",
  pageId: "page-1",
  instagramUserId: "ig-1",
  mode: "new_cbo",
  productId: "product-1",
  copy: {
    primaryText: "Comodas y livianas",
    headline: "Zapatillas urbanas",
    description: "Envio gratis",
    cta: "SHOP_NOW",
  },
  items: [{ source: "upload", creativeId: "c1", adName: "Anuncio 1" }],
  dailyBudgetMinor: 2000,
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  countries: ["AR", "UY"],
  optimizationEvent: "PURCHASE",
  campaignName: "CBO",
  adsetName: "CONJ",
};

const featuresOff = {
  creative_features_spec: {
    image_touchups: { enroll_status: "OPT_OUT" },
    text_optimizations: { enroll_status: "OPT_OUT" },
  },
};

const imageAd = () => ({
  status: "PAUSED",
  creative: {
    effective_object_story_id: "page-1_111",
    degrees_of_freedom_spec: featuresOff,
    object_story_spec: {
      page_id: "page-1",
      instagram_user_id: "ig-1",
      link_data: {
        link: LANDING,
        name: "Zapatillas urbanas",
        message: "Comodas y livianas",
        description: "Envio gratis",
      },
    },
  },
});

const videoAd = () => ({
  status: "PAUSED",
  issues_info: [],
  creative: {
    effective_object_story_id: "page-1_222",
    degrees_of_freedom_spec: featuresOff,
    object_story_spec: {
      page_id: "page-1",
      instagram_user_id: "ig-1",
      video_data: {
        title: "Zapatillas urbanas",
        message: "Comodas y livianas",
        link_description: "Envio gratis",
        call_to_action: { value: { link: LANDING } },
      },
    },
  },
});

const cloneAd = () => ({
  status: "PAUSED",
  creative: {
    effective_object_story_id: STORY_ID,
    degrees_of_freedom_spec: featuresOff,
  },
});

const objects = (): LaunchObjects => ({
  campaign: {
    status: "PAUSED",
    daily_budget: 2000,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  },
  adset: {
    status: "PAUSED",
    optimization_goal: "OFFSITE_CONVERSIONS",
    start_time: "2026-11-18T08:00:00-0300",
    promoted_object: { pixel_id: "pixel-1", custom_event_type: "PURCHASE" },
    targeting: { geo_locations: { countries: ["UY", "AR"] } },
  },
  ads: [imageAd(), videoAd(), cloneAd()],
  videos: [{ id: "video-1", status: { video_status: "ready" } }],
});

const expected = (): VerifyExpectations => ({
  draft,
  advantageCreativeEnabled: false,
  landingUrl: LANDING,
  landingUp: true,
  expectedAds: 3,
  storyIds: [STORY_ID],
  now: NOW,
});

const resultOf = (
  code: CheckCode,
  read: LaunchObjects = objects(),
  expectations: VerifyExpectations = expected(),
) => buildLaunchChecks(read, expectations).find((check) => check.code === code);

const withObjects = (change: (read: LaunchObjects) => void) => {
  const read = objects();
  change(read);
  return read;
};

const firstSpec = (read: LaunchObjects) =>
  read.ads[0]!.creative!.object_story_spec!;

const redCases: [CheckCode, () => [LaunchObjects, VerifyExpectations]][] = [
  [
    "CAMPAIGN_PAUSED",
    () => [withObjects((r) => (r.campaign.status = "ACTIVE")), expected()],
  ],
  [
    "BUDGET_MATCH",
    () => [withObjects((r) => (r.campaign.daily_budget = 2500)), expected()],
  ],
  [
    "ADSET_PAUSED",
    () => [withObjects((r) => (r.adset.status = "ACTIVE")), expected()],
  ],
  [
    "START_TIME",
    () => [
      withObjects((r) => (r.adset.start_time = "2026-12-01T00:00:00-0300")),
      expected(),
    ],
  ],
  [
    "BID",
    () => [
      withObjects((r) => (r.adset.bid_amount = 300)),
      {
        ...expected(),
        draft: { ...draft, bidStrategy: "COST_CAP", bidAmountMinor: 250 },
      },
    ],
  ],
  [
    "COUNTRIES",
    () => [
      withObjects(
        (r) => (r.adset.targeting = { geo_locations: { countries: ["AR"] } }),
      ),
      expected(),
    ],
  ],
  [
    "PIXEL",
    () => [
      withObjects((r) => (r.adset.promoted_object!.pixel_id = "pixel-2")),
      expected(),
    ],
  ],
  [
    "EVENT",
    () => [
      withObjects(
        (r) => (r.adset.promoted_object!.custom_event_type = "ADD_TO_CART"),
      ),
      expected(),
    ],
  ],
  [
    "OPT_GOAL",
    () => [
      withObjects((r) => (r.adset.optimization_goal = "LINK_CLICKS")),
      expected(),
    ],
  ],
  ["AD_COUNT", () => [objects(), { ...expected(), expectedAds: 4 }]],
  [
    "LINK",
    () => [
      withObjects(
        (r) => (firstSpec(r).link_data!.link = "https://otra.example.test"),
      ),
      expected(),
    ],
  ],
  ["LANDING_UP", () => [objects(), { ...expected(), landingUp: false }]],
  [
    "PAGE",
    () => [withObjects((r) => (firstSpec(r).page_id = "page-2")), expected()],
  ],
  [
    "INSTAGRAM",
    () => [
      withObjects((r) => (firstSpec(r).instagram_user_id = "ig-2")),
      expected(),
    ],
  ],
  [
    "TEXTS",
    () => [
      withObjects((r) => (firstSpec(r).link_data!.name = "Otro titular")),
      expected(),
    ],
  ],
  [
    "ADS_PAUSED_NO_ISSUES",
    () => [
      withObjects((r) => (r.ads[1]!.issues_info = [{ error_code: 1 }])),
      expected(),
    ],
  ],
  [
    "ENHANCEMENTS_OFF",
    () => [
      withObjects(
        (r) =>
          (r.ads[0]!.creative!.degrees_of_freedom_spec = {
            creative_features_spec: {
              image_touchups: { enroll_status: "OPT_IN" },
            },
          }),
      ),
      expected(),
    ],
  ],
  [
    "VIDEO_READY",
    () => [
      withObjects(
        (r) => (r.videos[0]!.status = { video_status: "processing" }),
      ),
      expected(),
    ],
  ],
];

describe("buildLaunchChecks", () => {
  it("returns every check green for a launch that matches the draft", () => {
    const checks = buildLaunchChecks(objects(), expected());

    expect(checks.map(({ code }) => code).sort()).toEqual(
      redCases.map(([code]) => code).sort(),
    );
    expect(checks.filter(({ ok }) => !ok)).toEqual([]);
    expect(checks.every(({ text }) => text.length > 0)).toBe(true);
  });

  it.each(redCases)("fails %s when Meta differs", (code, build) => {
    const [read, expectations] = build();

    expect(resultOf(code, read, expectations)).toMatchObject({
      code,
      ok: false,
    });
    expect(
      buildLaunchChecks(read, expectations).filter(({ ok }) => !ok),
    ).toHaveLength(1);
  });

  it("passes BID for COST_CAP when bid_amount matches", () => {
    const read = withObjects((r) => (r.adset.bid_amount = 250));
    const expectations = {
      ...expected(),
      draft: {
        ...draft,
        bidStrategy: "COST_CAP" as const,
        bidAmountMinor: 250,
      },
    };

    expect(resultOf("BID", read, expectations)).toMatchObject({ ok: true });
  });

  it("requires bid_amount on existing_cbo when the campaign uses COST_CAP", () => {
    const expectations = {
      ...expected(),
      draft: { ...draft, mode: "existing_cbo" as const },
    };
    const capped = withObjects((r) => (r.campaign.bid_strategy = "COST_CAP"));

    expect(resultOf("BID", capped, expectations)).toMatchObject({ ok: false });
    capped.adset.bid_amount = 400;
    expect(resultOf("BID", capped, expectations)).toMatchObject({ ok: true });
  });

  it("skips campaign checks for existing_cbo", () => {
    const codes = buildLaunchChecks(objects(), {
      ...expected(),
      draft: { ...draft, mode: "existing_cbo" },
    }).map(({ code }) => code);

    expect(codes).not.toContain("CAMPAIGN_PAUSED");
    expect(codes).not.toContain("BUDGET_MATCH");
    expect(codes).not.toContain("COUNTRIES");
  });

  it("accepts a start time up to the scheduled startAt", () => {
    const read = withObjects(
      (r) => (r.adset.start_time = "2026-12-01T00:00:00-0300"),
    );

    expect(
      resultOf("START_TIME", read, {
        ...expected(),
        draft: { ...draft, startAt: "2026-12-01T03:00:00Z" },
      }),
    ).toMatchObject({ ok: true });
  });

  it("allows OPT_IN features when Advantage+ creative is enabled", () => {
    const read = withObjects(
      (r) =>
        (r.ads[0]!.creative!.degrees_of_freedom_spec = {
          creative_features_spec: {
            image_touchups: { enroll_status: "OPT_IN" },
          },
        }),
    );

    expect(
      resultOf("ENHANCEMENTS_OFF", read, {
        ...expected(),
        advantageCreativeEnabled: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it("fails PAGE when a cloned post belongs to another page", () => {
    const read = withObjects(
      (r) => (r.ads[2]!.creative!.effective_object_story_id = "page-2_999"),
    );

    expect(
      resultOf("PAGE", read, { ...expected(), storyIds: ["page-2_999"] }),
    ).toMatchObject({ ok: false });
  });

  it("fails TEXTS when a cloned ad does not use a chosen post", () => {
    expect(
      resultOf("TEXTS", objects(), { ...expected(), storyIds: [] }),
    ).toMatchObject({ ok: false });
  });

  it("fails ADS_PAUSED_NO_ISSUES when an ad is active", () => {
    const read = withObjects((r) => (r.ads[0]!.status = "ACTIVE"));

    expect(resultOf("ADS_PAUSED_NO_ISSUES", read)).toMatchObject({ ok: false });
  });
});
