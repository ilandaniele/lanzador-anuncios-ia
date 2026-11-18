import { CAMPAIGN_STATUSES } from "../../../shared/schemas/meta-campaigns";
import type { MetricsLevel } from "../../../shared/schemas/metrics";
import type { Env } from "../../env";
import type { InsightRow } from "../../integrations/meta/read";
import { selectMetricsContextRows } from "../../repositories/metrics";
import type { Scope } from "../../repositories/scope";
import { listAccountCampaigns } from "../meta/campaigns";
import type { MetricsAccount } from "./accounts";
import type { AccountInsights, EntityInfo, MetricsContext } from "./aggregate";

const CAMPAIGN_STATUS_FILTER = [...CAMPAIGN_STATUSES].sort();

const unique = <Item>(items: Item[]) => [...new Set(items)];

function objectIds(insights: AccountInsights[]) {
  const rows = insights.flatMap(({ rows }) => rows as InsightRow[]);
  return {
    objectIds: unique(rows.map(({ id }) => id)),
    campaignIds: unique(
      rows.flatMap((row) => {
        const campaignId = row.level === "campaign" ? row.id : row.campaignId;
        return campaignId ? [campaignId] : [];
      }),
    ),
  };
}

async function campaignEntities(
  env: Env,
  scope: Scope,
  accounts: MetricsAccount[],
): Promise<Map<string, EntityInfo>> {
  const lists = await Promise.all(
    accounts.map((account) =>
      listAccountCampaigns(env, scope, account.id, CAMPAIGN_STATUS_FILTER)
        .then(({ data }) => data)
        .catch(() => []),
    ),
  );
  return new Map(
    lists
      .flat()
      .map(({ id, effectiveStatus, dailyBudgetMinor }) => [
        id,
        { status: effectiveStatus, dailyBudgetMinor },
      ]),
  );
}

export async function buildMetricsContext(
  env: Env,
  scope: Scope,
  request: {
    accounts: MetricsAccount[];
    level: MetricsLevel;
    insights: AccountInsights[];
    at: number;
  },
): Promise<MetricsContext> {
  const { accounts, level, insights, at } = request;
  const [{ launchRows, scaleRows, protectedRows }, entities] =
    await Promise.all([
      selectMetricsContextRows(env.DB, scope, objectIds(insights)),
      level === "campaign"
        ? campaignEntities(env, scope, accounts)
        : new Map<string, EntityInfo>(),
    ]);
  return {
    entities,
    productByCampaign: new Map(
      launchRows.flatMap(({ campaignId, productId }) =>
        campaignId && productId ? [[campaignId, productId] as const] : [],
      ),
    ),
    protectedCampaignIds: new Set(
      protectedRows.map(({ campaignId }) => campaignId),
    ),
    lastScaledAt: new Map(
      scaleRows.flatMap(({ objectId, at: scaledAt }) =>
        objectId ? [[objectId, scaledAt] as const] : [],
      ),
    ),
    now: at,
  };
}
