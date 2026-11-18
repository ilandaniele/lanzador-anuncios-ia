import type { PilotRule } from "../../../shared/schemas/pilot";
import type { Env } from "../../env";
import type { InsightRow } from "../../integrations/meta/read";
import type { InsightsCacheKey } from "../../repositories/insights-cache";
import { selectProductEconomics } from "../../repositories/pilot";
import type { Scope } from "../../repositories/scope";
import { AppError } from "../../lib/errors";
import { listMetricsAccounts, type MetricsAccount } from "../metrics/accounts";
import {
  aggregateMetrics,
  type AccountInsights,
  type MetricsContext,
  type MetricsRow,
} from "../metrics/aggregate";
import { buildMetricsContext } from "../metrics/context";
import { loadFreshInsights } from "./insights";
import { resolveRangeKey } from "./range-key";
import { rowSourceKey, ruleRowSource } from "./row-source";
import type { ProductEconomics, RuleRowSource } from "./types";

interface SourceTarget {
  sourceKey: string;
  account: MetricsAccount;
  key: InsightsCacheKey;
}

export interface PilotData {
  rows: Map<string, MetricsRow[]>;
  products: Map<string, ProductEconomics>;
}

const uniqueSources = (rules: readonly PilotRule[]): RuleRowSource[] => [
  ...new Map(
    rules
      .filter(({ enabled }) => enabled)
      .map((rule) => ruleRowSource(rule))
      .map((source) => [rowSourceKey(source), source] as const),
  ).values(),
];

const targetsOf = (
  sources: RuleRowSource[],
  accounts: MetricsAccount[],
  at: number,
): SourceTarget[] =>
  sources.flatMap((source) =>
    accounts.map((account) => ({
      sourceKey: rowSourceKey(source),
      account,
      key: {
        adAccountAssetId: account.id,
        level: source.level,
        rangeKey: resolveRangeKey(source.range, account.timezone, at),
      },
    })),
  );

function withParentStatus(
  context: MetricsContext,
  insights: AccountInsights[],
): MetricsContext {
  const entities = new Map(context.entities);
  for (const row of insights.flatMap(({ rows }) => rows as InsightRow[])) {
    const parent =
      row.level === "campaign" || !row.campaignId
        ? undefined
        : context.entities.get(row.campaignId);
    if (parent) entities.set(row.id, { ...parent, dailyBudgetMinor: null });
  }
  return { ...context, entities };
}

async function loadProducts(
  env: Env,
  scope: Scope,
  rows: Map<string, MetricsRow[]>,
) {
  const productIds = [
    ...new Set(
      [...rows.values()].flatMap((sourceRows) =>
        sourceRows.flatMap(({ productId }) => (productId ? [productId] : [])),
      ),
    ),
  ];
  if (productIds.length === 0) return new Map<string, ProductEconomics>();
  const economics = await selectProductEconomics(env.DB, scope, productIds);
  return new Map(
    economics.map(({ id, priceMinor, costMinor }) => [
      id,
      { priceMinor, costMinor },
    ]),
  );
}

export async function loadPilotData(
  env: Env,
  scope: Scope,
  rules: readonly PilotRule[],
  at: number,
): Promise<PilotData> {
  const accounts = await listMetricsAccounts(env.DB, scope);
  const targets = targetsOf(uniqueSources(rules), accounts, at);
  if (targets.length === 0) return { rows: new Map(), products: new Map() };
  const freshEntry = await loadFreshInsights(
    env,
    scope,
    targets.map(({ key }) => key),
    at,
  );
  const loaded = targets.flatMap(({ sourceKey, account, key }) => {
    const entry = freshEntry(key);
    return entry
      ? [
          {
            sourceKey,
            insights: {
              adAccountId: account.metaId,
              currency: account.currency,
              rows: entry.rows,
            },
          },
        ]
      : [];
  });
  if (loaded.length === 0) {
    throw new AppError(502, "META_ERROR", { message: "No fresh insights" });
  }
  const allInsights = loaded.map(({ insights }) => insights);
  const context = withParentStatus(
    await buildMetricsContext(env, scope, {
      accounts,
      level: "campaign",
      insights: allInsights,
      at,
    }),
    allInsights,
  );
  const rows = new Map<string, MetricsRow[]>();
  for (const sourceKey of new Set(loaded.map((entry) => entry.sourceKey))) {
    rows.set(
      sourceKey,
      aggregateMetrics({
        accounts: loaded
          .filter((entry) => entry.sourceKey === sourceKey)
          .map(({ insights }) => insights),
        previousAccounts: [],
        context,
        filters: {},
      }).rows,
    );
  }
  return { rows, products: await loadProducts(env, scope, rows) };
}
