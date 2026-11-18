import { describe, expect, it } from "vitest";
import type { PilotRule } from "../../../src/shared/schemas/pilot";
import type { MetricsRow } from "../../../src/api/services/metrics/aggregate";
import {
  dedupeKey,
  evaluateRules,
  type ProductEconomics,
  type RulesInput,
  rowSourceKey,
  ruleRowSource,
} from "../../../src/api/services/pilot/rules-engine";

const NOW = Date.parse("2026-03-10T12:00:00Z");
const HOUR_MS = 3_600_000;

const LIMITS = { maxScalePercent: 50, maxCampaignBudgetMinor: 30_000 };

const pauseNoSalesRule = (
  params: Partial<
    Extract<PilotRule, { ruleType: "pause_no_sales" }>["params"]
  > = {},
): PilotRule => ({
  ruleType: "pause_no_sales",
  enabled: true,
  params: {
    level: "ad",
    targetCpaSource: "product_margin",
    fallbackTargetCpaMinor: 1500,
    spendMultiplier: 2,
    window: "today",
    ...params,
  },
});

const pauseLowRoasRule = (
  params: Partial<
    Extract<PilotRule, { ruleType: "pause_low_roas" }>["params"]
  > = {},
): PilotRule => ({
  ruleType: "pause_low_roas",
  enabled: true,
  params: {
    level: "campaign",
    roasMax: 1,
    minSpendMinor: 3000,
    window: "daily:last_3d",
    ...params,
  },
});

const scaleWinnerRule = (
  params: Partial<
    Extract<PilotRule, { ruleType: "scale_winner" }>["params"]
  > = {},
): PilotRule => ({
  ruleType: "scale_winner",
  enabled: true,
  params: {
    breakEvenMultiplier: 1.3,
    fallbackMinRoas: 2.5,
    days: 3,
    minSpendMinor: 1500,
    percent: 30,
    minHoursBetween: 24,
    ...params,
  },
});

const duplicateWinnerRule = (
  params: Partial<
    Extract<PilotRule, { ruleType: "duplicate_winner" }>["params"]
  > = {},
): PilotRule => ({
  ruleType: "duplicate_winner",
  enabled: true,
  params: { minRoas: 2, minSpendMinor: 3000, range: "last_7d", ...params },
});

const row = (overrides: Partial<MetricsRow> = {}): MetricsRow => ({
  id: "ad1",
  name: "Ad 1",
  level: "ad",
  status: "ACTIVE",
  adAccountId: "act_1",
  currency: "USD",
  spendMinor: 0,
  impressions: 1000,
  clicks: 20,
  purchases: 0,
  purchaseValueMinor: 0,
  roas: null,
  cpaMinor: null,
  ctr: 2,
  cpmMinor: 100,
  protected: false,
  ...overrides,
});

const sourceKeyOf = (rule: PilotRule) => rowSourceKey(ruleRowSource(rule));

const run = (
  rule: PilotRule,
  rows: MetricsRow[],
  extra: Partial<RulesInput> = {},
) =>
  evaluateRules({
    rules: [rule],
    rows: new Map([[sourceKeyOf(rule), rows]]),
    products: new Map(),
    limits: LIMITS,
    pendingDedupeKeys: new Set(),
    now: NOW,
    ...extra,
  });

const product = (priceMinor: number | null, costMinor: number | null) =>
  new Map<string, ProductEconomics>([["p1", { priceMinor, costMinor }]]);

describe("pause_no_sales", () => {
  it("proposes pause when spend reaches multiplier x margin target and no purchases", () => {
    const [draft, ...rest] = run(
      pauseNoSalesRule(),
      [row({ spendMinor: 6000, productId: "p1" })],
      { products: product(10_000, 7000) },
    );
    expect(rest).toEqual([]);
    expect(draft).toMatchObject({
      ruleType: "pause_no_sales",
      action: "pause",
      level: "ad",
      objectId: "ad1",
      objectName: "Ad 1",
      adAccountId: "act_1",
      dedupeKey: "pause:ad1",
      expiresAt: NOW + 12 * HOUR_MS,
      currentBudgetMinor: null,
      proposedBudgetMinor: null,
      percent: null,
    });
    expect(draft?.evidence).toMatchObject({
      range: "today",
      spendMinor: 6000,
      purchases: 0,
      targetCpaMinor: 3000,
      spendThresholdMinor: 6000,
    });
  });

  it("keeps ad below the spend threshold", () => {
    expect(
      run(pauseNoSalesRule(), [row({ spendMinor: 5999, productId: "p1" })], {
        products: product(10_000, 7000),
      }),
    ).toEqual([]);
  });

  it("keeps ad with purchases", () => {
    expect(
      run(pauseNoSalesRule(), [row({ spendMinor: 90_000, purchases: 1 })]),
    ).toEqual([]);
  });

  it("falls back to the fixed amount without product margin", () => {
    const rows = [row({ spendMinor: 3000 })];
    expect(run(pauseNoSalesRule(), rows)).toHaveLength(1);
    expect(run(pauseNoSalesRule(), [row({ spendMinor: 2999 })])).toEqual([]);
  });

  it.each([
    ["missing price", product(null, 100)],
    ["missing cost", product(10_000, null)],
    ["cost at price", product(10_000, 10_000)],
  ])("falls back when margin unusable: %s", (_label, products) => {
    const rows = [row({ spendMinor: 3000, productId: "p1" })];
    expect(run(pauseNoSalesRule(), rows, { products })).toHaveLength(1);
  });

  it("uses the fixed amount even when the product has margin", () => {
    const rule = pauseNoSalesRule({
      targetCpaSource: "fixed",
      fallbackTargetCpaMinor: 500,
    });
    const rows = [row({ spendMinor: 1000, productId: "p1" })];
    expect(run(rule, rows, { products: product(10_000, 0) })).toHaveLength(1);
  });

  it("ignores zero spend", () => {
    expect(run(pauseNoSalesRule(), [row({ spendMinor: 0 })])).toEqual([]);
  });

  it("ignores paused objects", () => {
    expect(
      run(pauseNoSalesRule(), [row({ spendMinor: 90_000, status: "PAUSED" })]),
    ).toEqual([]);
  });

  it("reads rows of the configured window and level", () => {
    const rule = pauseNoSalesRule({ level: "adset", window: "yesterday" });
    expect(ruleRowSource(rule)).toEqual({ range: "yesterday", level: "adset" });
    expect(sourceKeyOf(rule)).toBe("yesterday:adset");
  });
});

describe("pause_low_roas", () => {
  it("proposes pause at or below roasMax with enough spend", () => {
    const [draft] = run(pauseLowRoasRule(), [
      row({
        id: "c1",
        level: "campaign",
        spendMinor: 3000,
        purchaseValueMinor: 2400,
        roas: 0.8,
      }),
    ]);
    expect(draft).toMatchObject({
      ruleType: "pause_low_roas",
      action: "pause",
      level: "campaign",
      dedupeKey: "pause:c1",
    });
    expect(draft?.evidence).toMatchObject({
      range: "daily:last_3d",
      roas: 0.8,
      roasMax: 1,
    });
  });

  it("proposes pause for spend without any sales value (roas 0)", () => {
    expect(
      run(pauseLowRoasRule(), [
        row({ level: "campaign", spendMinor: 5000, roas: 0 }),
      ]),
    ).toHaveLength(1);
  });

  it("keeps campaigns above roasMax", () => {
    expect(
      run(pauseLowRoasRule(), [
        row({ level: "campaign", spendMinor: 9000, roas: 1.01 }),
      ]),
    ).toEqual([]);
  });

  it("keeps campaigns below minSpendMinor", () => {
    expect(
      run(pauseLowRoasRule(), [
        row({ level: "campaign", spendMinor: 2999, roas: 0.2 }),
      ]),
    ).toEqual([]);
  });

  it("ignores zero spend (roas null)", () => {
    expect(
      run(pauseLowRoasRule({ minSpendMinor: 1 }), [
        row({ level: "campaign", spendMinor: 0, roas: null }),
      ]),
    ).toEqual([]);
  });
});

describe("scale_winner", () => {
  const winner = (overrides: Partial<MetricsRow> = {}) =>
    row({
      id: "c1",
      name: "Campaign 1",
      level: "campaign",
      spendMinor: 5000,
      purchaseValueMinor: 15_000,
      roas: 3,
      dailyBudgetMinor: 10_000,
      productId: "p1",
      ...overrides,
    });

  it("proposes scale with budget and percent when roas beats break-even x multiplier", () => {
    const [draft] = run(scaleWinnerRule(), [winner()], {
      products: product(10_000, 5000),
    });
    expect(draft).toMatchObject({
      ruleType: "scale_winner",
      action: "scale",
      level: "campaign",
      dedupeKey: "scale:c1",
      currentBudgetMinor: 10_000,
      proposedBudgetMinor: 13_000,
      percent: 30,
    });
    expect(draft?.evidence).toMatchObject({
      range: "daily:last_3d",
      minRoas: 2.6,
    });
  });

  it("keeps campaigns below break-even x multiplier", () => {
    expect(
      run(scaleWinnerRule(), [winner({ roas: 2.59 })], {
        products: product(10_000, 5000),
      }),
    ).toEqual([]);
  });

  it("accepts roas exactly at the threshold", () => {
    expect(
      run(scaleWinnerRule(), [winner({ roas: 2.6 })], {
        products: product(10_000, 5000),
      }),
    ).toHaveLength(1);
  });

  it("uses fallbackMinRoas without product margin", () => {
    expect(run(scaleWinnerRule(), [winner({ roas: 2.5 })])).toHaveLength(1);
    expect(run(scaleWinnerRule(), [winner({ roas: 2.49 })])).toEqual([]);
  });

  it("keeps campaigns below minSpendMinor", () => {
    expect(run(scaleWinnerRule(), [winner({ spendMinor: 1499 })])).toEqual([]);
  });

  it("ignores zero spend", () => {
    expect(
      run(scaleWinnerRule(), [winner({ spendMinor: 0, roas: null })]),
    ).toEqual([]);
  });

  it("skips campaigns without a daily budget", () => {
    const withoutBudget = row({
      level: "campaign",
      spendMinor: 5000,
      roas: 3,
    });
    expect(run(scaleWinnerRule(), [withoutBudget])).toEqual([]);
  });

  it("skips paused campaigns", () => {
    expect(run(scaleWinnerRule(), [winner({ status: "PAUSED" })])).toEqual([]);
  });

  it("respects minHoursBetween", () => {
    expect(run(scaleWinnerRule(), [winner({ scaledHoursAgo: 23 })])).toEqual(
      [],
    );
    expect(
      run(scaleWinnerRule(), [winner({ scaledHoursAgo: 24 })]),
    ).toHaveLength(1);
    expect(
      run(scaleWinnerRule({ minHoursBetween: 48 }), [
        winner({ scaledHoursAgo: 47 }),
      ]),
    ).toEqual([]);
  });

  it("caps the percent at 50 even when the rule asks for more", () => {
    const [draft] = run(scaleWinnerRule({ percent: 80 }), [winner()]);
    expect(draft?.percent).toBe(50);
    expect(draft?.proposedBudgetMinor).toBe(15_000);
  });

  it("caps the percent at the workspace maxScalePercent", () => {
    const [draft] = run(scaleWinnerRule(), [winner()], {
      limits: { ...LIMITS, maxScalePercent: 20 },
    });
    expect(draft?.percent).toBe(20);
    expect(draft?.proposedBudgetMinor).toBe(12_000);
  });

  it("lowers the percent so the budget stays within the budget cap", () => {
    const [draft] = run(scaleWinnerRule(), [
      winner({ dailyBudgetMinor: 28_000 }),
    ]);
    expect(draft?.percent).toBe(7);
    expect(draft?.proposedBudgetMinor).toBe(30_000);
  });

  it("skips campaigns already at the budget cap", () => {
    expect(
      run(scaleWinnerRule(), [winner({ dailyBudgetMinor: 30_000 })]),
    ).toEqual([]);
  });
});

describe("duplicate_winner", () => {
  const winnerAd = (overrides: Partial<MetricsRow> = {}) =>
    row({
      spendMinor: 4000,
      purchaseValueMinor: 10_000,
      roas: 2.5,
      ...overrides,
    });

  it("proposes duplicate for ads with enough roas and spend", () => {
    const [draft] = run(duplicateWinnerRule(), [winnerAd()]);
    expect(draft).toMatchObject({
      ruleType: "duplicate_winner",
      action: "duplicate",
      level: "ad",
      dedupeKey: "duplicate:ad1",
      percent: null,
    });
    expect(draft?.evidence).toMatchObject({ range: "last_7d", minRoas: 2 });
  });

  it("keeps ads below minRoas or minSpendMinor", () => {
    expect(run(duplicateWinnerRule(), [winnerAd({ roas: 1.99 })])).toEqual([]);
    expect(
      run(duplicateWinnerRule(), [winnerAd({ spendMinor: 2999 })]),
    ).toEqual([]);
  });

  it("ignores zero spend", () => {
    expect(
      run(duplicateWinnerRule({ minSpendMinor: 1 }), [
        winnerAd({ spendMinor: 0, roas: null }),
      ]),
    ).toEqual([]);
  });

  it("reads rows of the configured range at ad level", () => {
    expect(sourceKeyOf(duplicateWinnerRule({ range: "last_14d" }))).toBe(
      "last_14d:ad",
    );
  });
});

describe("protected campaigns", () => {
  it.each([
    ["pause_no_sales", pauseNoSalesRule(), row({ spendMinor: 90_000 })],
    [
      "pause_low_roas",
      pauseLowRoasRule(),
      row({ level: "campaign", spendMinor: 9000, roas: 0.1 }),
    ],
    [
      "scale_winner",
      scaleWinnerRule(),
      row({
        level: "campaign",
        spendMinor: 9000,
        roas: 4,
        dailyBudgetMinor: 10_000,
      }),
    ],
    [
      "duplicate_winner",
      duplicateWinnerRule(),
      row({ spendMinor: 9000, roas: 4 }),
    ],
  ])("%s gets no proposal for protected rows", (_name, rule, source) => {
    expect(run(rule, [source])).toHaveLength(1);
    expect(run(rule, [{ ...source, protected: true }])).toEqual([]);
  });
});

describe("evaluateRules", () => {
  it("skips disabled rules", () => {
    const rule = { ...pauseNoSalesRule(), enabled: false } as PilotRule;
    expect(run(rule, [row({ spendMinor: 90_000 })])).toEqual([]);
  });

  it("returns nothing when no rows were provided for a rule", () => {
    expect(
      evaluateRules({
        rules: [pauseNoSalesRule()],
        rows: new Map(),
        products: new Map(),
        limits: LIMITS,
        pendingDedupeKeys: new Set(),
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("skips objects with a pending proposal of the same dedupe key", () => {
    const rows = [row({ spendMinor: 90_000 })];
    expect(
      run(pauseNoSalesRule(), rows, {
        pendingDedupeKeys: new Set([dedupeKey("pause", "ad1")]),
      }),
    ).toEqual([]);
  });

  it("keeps pending keys of other actions and objects", () => {
    const rows = [row({ spendMinor: 90_000 })];
    expect(
      run(pauseNoSalesRule(), rows, {
        pendingDedupeKeys: new Set(["scale:ad1", "pause:ad2"]),
      }),
    ).toHaveLength(1);
  });

  it("emits one proposal per object when two rules match the same pause", () => {
    const campaign = row({
      id: "c1",
      level: "campaign",
      spendMinor: 90_000,
      roas: 0,
    });
    const drafts = evaluateRules({
      rules: [pauseLowRoasRule(), pauseNoSalesRule({ level: "campaign" })],
      rows: new Map([
        [sourceKeyOf(pauseLowRoasRule()), [campaign]],
        [sourceKeyOf(pauseNoSalesRule({ level: "campaign" })), [campaign]],
      ]),
      products: new Map(),
      limits: LIMITS,
      pendingDedupeKeys: new Set(),
      now: NOW,
    });
    expect(
      drafts.map(({ ruleType, dedupeKey: key }) => [ruleType, key]),
    ).toEqual([["pause_no_sales", "pause:c1"]]);
  });

  it("evaluates every enabled rule over its own rows in a fixed order", () => {
    const pausedAd = row({ id: "ad9", spendMinor: 90_000 });
    const scaledCampaign = row({
      id: "c1",
      level: "campaign",
      spendMinor: 9000,
      roas: 4,
      dailyBudgetMinor: 10_000,
    });
    const duplicatedAd = row({ id: "ad2", spendMinor: 9000, roas: 4 });
    const rules = [
      duplicateWinnerRule(),
      scaleWinnerRule(),
      pauseNoSalesRule(),
    ];
    const drafts = evaluateRules({
      rules,
      rows: new Map([
        [sourceKeyOf(pauseNoSalesRule()), [pausedAd]],
        [sourceKeyOf(scaleWinnerRule()), [scaledCampaign]],
        [sourceKeyOf(duplicateWinnerRule()), [duplicatedAd]],
      ]),
      products: new Map(),
      limits: LIMITS,
      pendingDedupeKeys: new Set(),
      now: NOW,
    });
    expect(drafts.map(({ dedupeKey: key }) => key)).toEqual([
      "pause:ad9",
      "scale:c1",
      "duplicate:ad2",
    ]);
  });

  it("is deterministic for fixed input", () => {
    const rows = [row({ spendMinor: 90_000 })];
    expect(run(pauseNoSalesRule(), rows)).toEqual(
      run(pauseNoSalesRule(), rows),
    );
  });
});
