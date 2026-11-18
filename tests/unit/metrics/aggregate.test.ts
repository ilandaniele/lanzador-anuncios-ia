import { describe, expect, it } from "vitest";
import type { InsightRow } from "../../../src/api/integrations/meta/read";
import {
  type AccountInsights,
  type AggregateInput,
  aggregateMetrics,
  type MetricsContext,
} from "../../../src/api/services/metrics/aggregate";
import {
  previousRange,
  previousWindow,
} from "../../../src/api/services/metrics/previous-range";

const NOW = Date.parse("2026-03-10T12:00:00Z");
const HOUR_MS = 3_600_000;

const campaignRow = (overrides: Partial<InsightRow> = {}): InsightRow => ({
  level: "campaign",
  id: "c1",
  name: "Campaign 1",
  campaignId: null,
  adsetId: null,
  date: "2026-03-09",
  spendMinor: 1000,
  impressions: 10_000,
  clicks: 200,
  purchases: 2,
  purchaseValueMinor: 3000,
  roas: 3,
  cpaMinor: 500,
  ctr: 2,
  cpmMinor: 100,
  ...overrides,
});

const account = (
  adAccountId: string,
  currency: string,
  rows: InsightRow[],
): AccountInsights => ({ adAccountId, currency, rows });

const context = (overrides: Partial<MetricsContext> = {}): MetricsContext => ({
  entities: new Map(),
  productByCampaign: new Map(),
  protectedCampaignIds: new Set(),
  lastScaledAt: new Map(),
  now: NOW,
  ...overrides,
});

const aggregate = (
  accounts: AccountInsights[],
  extra: Partial<AggregateInput> = {},
) =>
  aggregateMetrics({
    accounts,
    previousAccounts: [],
    context: context(),
    filters: {},
    ...extra,
  });

const idsOf = (result: ReturnType<typeof aggregate>) =>
  result.rows.map(({ id }) => id);

describe("previous period", () => {
  it("last_7d previous period is the 7 days before", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(previousRange({ preset: "last_7d" }, "UTC", now)).toEqual({
      from: "2026-02-24",
      to: "2026-03-02",
    });
  });

  it("yesterday previous period is the day before", () => {
    expect(
      previousWindow({ since: "2026-03-09", until: "2026-03-09" }),
    ).toEqual({ since: "2026-03-08", until: "2026-03-08" });
  });

  it("custom range previous period has the same length", () => {
    expect(
      previousWindow({ since: "2026-03-01", until: "2026-03-10" }),
    ).toEqual({ since: "2026-02-19", until: "2026-02-28" });
  });
});

describe("aggregateMetrics totals", () => {
  it("never sums two currencies", () => {
    const { totals } = aggregate([
      account("a1", "USD", [campaignRow({ id: "c1" })]),
      account("a2", "ARS", [campaignRow({ id: "c2", spendMinor: 500 })]),
      account("a3", "USD", [campaignRow({ id: "c3", spendMinor: 250 })]),
    ]);
    expect(
      totals.map(({ currency, spendMinor }) => [currency, spendMinor]),
    ).toEqual([
      ["ARS", 500],
      ["USD", 1250],
    ]);
  });

  it("recomputes ratios from summed counters", () => {
    const { totals } = aggregate([
      account("a1", "USD", [
        campaignRow({ id: "c1" }),
        campaignRow({ id: "c2", spendMinor: 3000, purchaseValueMinor: 3000 }),
      ]),
    ]);
    expect(totals[0]).toMatchObject({
      spendMinor: 4000,
      purchaseValueMinor: 6000,
      roas: 1.5,
      cpaMinor: 1000,
      ctr: 2,
      cpmMinor: 200,
    });
  });

  it("groups previous totals by currency with the same filters", () => {
    const { previousTotals } = aggregate([], {
      filters: { q: "keep" },
      previousAccounts: [
        account("a1", "USD", [
          campaignRow({ id: "c1", name: "keep me" }),
          campaignRow({ id: "c2", name: "drop" }),
        ]),
        account("a2", "ARS", [campaignRow({ id: "c3", name: "keep too" })]),
      ],
    });
    expect(previousTotals.map(({ currency }) => currency)).toEqual([
      "ARS",
      "USD",
    ]);
    expect(previousTotals[1]?.spendMinor).toBe(1000);
  });

  it("merges daily rows of one entity into a single row", () => {
    const { rows } = aggregate([
      account("a1", "USD", [
        campaignRow({ date: "2026-03-08" }),
        campaignRow({ date: "2026-03-09" }),
      ]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ spendMinor: 2000, purchases: 4, roas: 3 });
  });

  it("returns no totals and null ratios for empty input", () => {
    expect(aggregate([]).totals).toEqual([]);
    const { totals } = aggregate([
      account("a1", "USD", [
        campaignRow({ spendMinor: 0, impressions: 0, clicks: 0, purchases: 0 }),
      ]),
    ]);
    expect(totals[0]).toMatchObject({ roas: null, ctr: null, cpmMinor: null });
  });
});

describe("aggregateMetrics filters", () => {
  const summer = campaignRow({ id: "c1", name: "Summer Sale" });
  const winter = campaignRow({ id: "c2", name: "Winter" });

  it("filters by account", () => {
    const result = aggregate(
      [account("a1", "USD", [summer]), account("a2", "USD", [winter])],
      { filters: { adAccountIds: ["a2"] } },
    );
    expect(idsOf(result)).toEqual(["c2"]);
  });

  it("filters by product through the campaign map, including ads", () => {
    const ad = campaignRow({ level: "ad", id: "ad1", campaignId: "c1" });
    const result = aggregate([account("a1", "USD", [summer, winter, ad])], {
      context: context({ productByCampaign: new Map([["c1", "p1"]]) }),
      filters: { productId: "p1" },
    });
    expect(idsOf(result)).toEqual(["ad1", "c1"]);
  });

  it("filters by status and drops rows with unknown status", () => {
    const result = aggregate([account("a1", "USD", [summer, winter])], {
      context: context({
        entities: new Map([
          ["c1", { status: "ACTIVE", dailyBudgetMinor: null }],
        ]),
      }),
      filters: { status: "ACTIVE" },
    });
    expect(idsOf(result)).toEqual(["c1"]);
  });

  it("filters by q on name, case-insensitive", () => {
    const result = aggregate([account("a1", "USD", [summer, winter])], {
      filters: { q: " SUMMER " },
    });
    expect(idsOf(result)).toEqual(["c1"]);
  });

  it("totals only cover filtered rows", () => {
    const result = aggregate([account("a1", "USD", [summer, winter])], {
      filters: { q: "winter" },
    });
    expect(result.totals[0]?.spendMinor).toBe(1000);
  });
});

describe("aggregateMetrics sorting", () => {
  const rows = [
    campaignRow({ id: "b", name: "B", spendMinor: 100, purchases: 0 }),
    campaignRow({ id: "a", name: "A", spendMinor: 300 }),
    campaignRow({ id: "c", name: "C", spendMinor: 300 }),
  ];
  const ids = (extra: Partial<AggregateInput> = {}) =>
    idsOf(aggregate([account("a1", "USD", rows)], extra));

  it("defaults to spend descending with id tie-break", () => {
    expect(ids()).toEqual(["a", "c", "b"]);
  });

  it("sorts ascending by key", () => {
    expect(ids({ sort: { key: "spendMinor", direction: "asc" } })).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("sorts by name", () => {
    expect(ids({ sort: { key: "name", direction: "desc" } })).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("puts null values last in both directions", () => {
    expect(ids({ sort: { key: "cpaMinor", direction: "asc" } }).at(-1)).toBe(
      "b",
    );
    expect(ids({ sort: { key: "cpaMinor", direction: "desc" } }).at(-1)).toBe(
      "b",
    );
  });
});

describe("aggregateMetrics row flags", () => {
  const ctx = context({
    protectedCampaignIds: new Set(["c1"]),
    lastScaledAt: new Map([["c1", NOW - (5 * HOUR_MS + 1)]]),
    entities: new Map([["c1", { status: "ACTIVE", dailyBudgetMinor: 5000 }]]),
  });

  it("marks protected campaigns and their ads", () => {
    const ad = campaignRow({ level: "ad", id: "ad1", campaignId: "c1" });
    const { rows } = aggregate(
      [account("a1", "USD", [campaignRow(), ad, campaignRow({ id: "c2" })])],
      { context: ctx },
    );
    const flags = Object.fromEntries(rows.map((r) => [r.id, r.protected]));
    expect(flags).toEqual({ c1: true, ad1: true, c2: false });
  });

  it("sets scaledHoursAgo in whole hours and omits it when never scaled", () => {
    const { rows } = aggregate(
      [account("a1", "USD", [campaignRow(), campaignRow({ id: "c2" })])],
      { context: ctx },
    );
    expect(rows.find(({ id }) => id === "c1")?.scaledHoursAgo).toBe(5);
    expect(rows.find(({ id }) => id === "c2")).not.toHaveProperty(
      "scaledHoursAgo",
    );
  });

  it("exposes status, budget, account and currency", () => {
    const { rows } = aggregate([account("a1", "ARS", [campaignRow()])], {
      context: ctx,
    });
    expect(rows[0]).toMatchObject({
      status: "ACTIVE",
      dailyBudgetMinor: 5000,
      adAccountId: "a1",
      currency: "ARS",
    });
  });
});
