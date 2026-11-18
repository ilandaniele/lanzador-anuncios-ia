import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readAccountHealth,
  readInsights,
  readIssues,
} from "../../../src/api/integrations/meta/read";
import {
  type InsightRange,
  resolveWindow,
} from "../../../src/shared/insight-range";
import { toMinorUnits } from "../../../src/shared/metrics";
import accountFixture from "../../fixtures/insights/account.json";
import adDailyFixture from "../../fixtures/insights/ad-daily.json";
import campaignFixture from "../../fixtures/insights/campaign.json";
import healthFixture from "../../fixtures/insights/health.json";
import healthNoCapFixture from "../../fixtures/insights/health-no-cap.json";
import issuesFixture from "../../fixtures/insights/issues.json";
import { captureRequests, graph, rejection } from "../../helpers/meta-graph";
import { metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const ACT = "act_1001";
const TIMEZONE = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-11-17T02:30:00Z");

const query = (overrides = {}) => ({
  actId: ACT,
  level: "campaign" as const,
  range: { preset: "today" } as InsightRange,
  currency: "USD",
  timezone: TIMEZONE,
  ...overrides,
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe("toMinorUnits", () => {
  it("converts decimal strings without float drift", () => {
    expect(toMinorUnits("10.07", "USD")).toBe(1007);
    expect(toMinorUnits("1.005", "USD")).toBe(101);
    expect(toMinorUnits("0", "USD")).toBe(0);
  });

  it("respects the currency exponent", () => {
    expect(toMinorUnits("1500", "JPY")).toBe(1500);
    expect(toMinorUnits("1.234", "KWD")).toBe(1234);
  });
});

describe("resolveWindow", () => {
  const window = (range: InsightRange) => resolveWindow(range, TIMEZONE, NOW);

  it("uses the account timezone, not UTC, to find today", () => {
    expect(window({ preset: "today" })).toEqual({
      since: "2026-11-16",
      until: "2026-11-16",
    });
  });

  it("resolves every preset", () => {
    expect(window({ preset: "yesterday" })).toEqual({
      since: "2026-11-15",
      until: "2026-11-15",
    });
    expect(window({ preset: "last_7d" })).toEqual({
      since: "2026-11-09",
      until: "2026-11-15",
    });
    expect(window({ preset: "last_14d" }).since).toBe("2026-11-02");
    expect(window({ preset: "last_30d" }).since).toBe("2026-10-17");
    expect(window({ preset: "this_month" })).toEqual({
      since: "2026-11-01",
      until: "2026-11-16",
    });
  });

  it("accepts a custom range ending on the account local today", () => {
    expect(window({ from: "2026-10-01", to: "2026-11-16" })).toEqual({
      since: "2026-10-01",
      until: "2026-11-16",
    });
  });

  it.each([
    ["future end", { from: "2026-11-01", to: "2026-11-17" }],
    ["reversed", { from: "2026-11-10", to: "2026-11-01" }],
    ["longer than 400 days", { from: "2025-10-01", to: "2026-11-16" }],
    ["impossible date", { from: "2026-02-30", to: "2026-03-01" }],
    ["bad format", { from: "11/01/2026", to: "2026-11-02" }],
  ])("rejects a %s custom range", (_name, range) => {
    expect(() => window(range)).toThrow("RANGE_INVALID");
  });
});

describe("readInsights", () => {
  it("normalizes money to minor units and computes ROAS, CPA, CTR, CPM", async () => {
    server.use(metaReplies(`${ACT}/insights`, campaignFixture));

    const { window, rows } = await readInsights(graph(), query(), NOW);

    expect(window).toEqual({ since: "2026-11-16", until: "2026-11-16" });
    expect(rows[0]).toEqual({
      level: "campaign",
      id: "120000000000101",
      name: "CBO Ganadora",
      campaignId: "120000000000101",
      adsetId: null,
      date: "2026-11-17",
      spendMinor: 12550,
      impressions: 10000,
      clicks: 250,
      purchases: 5,
      purchaseValueMinor: 50200,
      roas: 4,
      cpaMinor: 2510,
      ctr: 2.5,
      cpmMinor: 1255,
    });
  });

  it("leaves ratios null when there is nothing to divide by", async () => {
    server.use(metaReplies(`${ACT}/insights`, campaignFixture));

    const { rows } = await readInsights(graph(), query(), NOW);

    expect(rows[1]).toMatchObject({
      spendMinor: 4007,
      purchases: 0,
      purchaseValueMinor: 0,
      roas: 0,
      cpaMinor: null,
      ctr: 1,
      cpmMinor: 1336,
    });
    expect(rows[2]).toMatchObject({
      spendMinor: 0,
      impressions: 0,
      roas: null,
      cpaMinor: null,
      ctr: null,
      cpmMinor: null,
    });
  });

  it("uses the account id and no name at account level", async () => {
    server.use(metaReplies(`${ACT}/insights`, accountFixture));

    const { rows } = await readInsights(
      graph(),
      query({ level: "account" }),
      NOW,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: ACT,
      name: null,
      spendMinor: 16557,
      roas: 3.03,
      cpaMinor: 3311,
    });
  });

  it("sends level, bounded fields and the resolved window as time_range", async () => {
    server.use(metaReplies(`${ACT}/insights`, adDailyFixture));
    const requests = captureRequests();

    const { rows } = await readInsights(
      graph(),
      query({
        level: "ad",
        range: { from: "2026-11-16", to: "2026-11-16" },
        daily: true,
      }),
      NOW,
    );

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("level")).toBe("ad");
    expect(url.searchParams.get("fields")).toBe(
      "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,actions,action_values,date_start,date_stop",
    );
    expect(JSON.parse(url.searchParams.get("time_range")!)).toEqual({
      since: "2026-11-16",
      until: "2026-11-16",
    });
    expect(url.searchParams.get("time_increment")).toBe("1");
    expect(rows.map(({ date }) => date)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(rows[0]).toMatchObject({
      id: "6001",
      adsetId: "120000000000201",
      campaignId: "120000000000101",
    });
  });

  it("omits time_increment unless daily", async () => {
    server.use(metaReplies(`${ACT}/insights`, campaignFixture));
    const requests = captureRequests();

    await readInsights(graph(), query(), NOW);

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.has("time_increment")).toBe(false);
  });

  it("throws a transient MetaError when a campaign row has no id", async () => {
    server.use(
      metaReplies(`${ACT}/insights`, {
        data: [{ spend: "1.00", date_start: "2026-11-16" }],
      }),
    );

    const error = await rejection(readInsights(graph(), query(), NOW));

    expect(error.kind).toBe("transient");
  });

  it("throws a transient MetaError on a non-numeric spend", async () => {
    server.use(
      metaReplies(`${ACT}/insights`, {
        data: [{ campaign_id: "1", spend: "abc", date_start: "2026-11-16" }],
      }),
    );

    const error = await rejection(readInsights(graph(), query(), NOW));

    expect(error.kind).toBe("transient");
  });
});

describe("readAccountHealth", () => {
  it("returns status, funding and minor-unit spend cap", async () => {
    server.use(metaReplies(ACT, healthFixture));
    const requests = captureRequests();

    const health = await readAccountHealth(graph(), ACT);

    expect(new URL(requests[0]!.url).searchParams.get("fields")).toContain(
      "spend_cap",
    );
    expect(health).toEqual({
      accountStatus: 3,
      disableReason: 0,
      currency: "USD",
      spendCapMinor: 500000,
      amountSpentMinor: 123456,
      balanceMinor: 2500,
      isPrepay: false,
      fundingSource: { id: "9001", type: 1, label: "Visa *4242" },
    });
  });

  it("treats spend_cap 0 as no cap and tolerates missing funding", async () => {
    server.use(metaReplies(ACT, healthNoCapFixture));

    const health = await readAccountHealth(graph(), ACT);

    expect(health).toMatchObject({
      accountStatus: 1,
      spendCapMinor: null,
      balanceMinor: null,
      fundingSource: null,
    });
  });
});

describe("readIssues", () => {
  it("filters to problem statuses and keeps only ads with issues_info", async () => {
    server.use(metaReplies(`${ACT}/ads`, issuesFixture));
    const requests = captureRequests();

    const ads = await readIssues(graph(), ACT);

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("fields")).toContain("issues_info");
    expect(JSON.parse(url.searchParams.get("filtering")!)).toEqual([
      {
        field: "effective_status",
        operator: "IN",
        value: ["WITH_ISSUES", "DISAPPROVED"],
      },
    ]);
    expect(ads).toEqual([
      {
        adId: "6001",
        name: "Ad Rechazado",
        effectiveStatus: "DISAPPROVED",
        campaignId: "120000000000101",
        adsetId: "120000000000201",
        issues: [
          {
            level: "AD",
            code: 1487194,
            summary: "Anuncio rechazado",
            message: "El anuncio infringe las políticas.",
            type: "ERROR",
          },
        ],
      },
    ]);
  });
});
