import type { TodayAccountDto } from "../../../shared/schemas/today";
import {
  type AccountInsights,
  buildMetricsRows,
  type MetricsContext,
} from "../metrics/aggregate";
import type { AccountView } from "./insights";

const emptyContext = (at: number): MetricsContext => ({
  entities: new Map(),
  productByCampaign: new Map(),
  protectedCampaignIds: new Set(),
  lastScaledAt: new Map(),
  now: at,
});

const totalsOf = (insights: AccountInsights[], at: number) =>
  insights.flatMap((entry) => buildMetricsRows(entry, emptyContext(at)))[0];

export function toTodayAccount(
  { account, today, yesterday }: AccountView,
  at: number,
): TodayAccountDto {
  const current = totalsOf(today, at);
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    spendTodayMinor: current?.spendMinor ?? 0,
    spendYesterdayMinor: totalsOf(yesterday, at)?.spendMinor ?? 0,
    purchases: current?.purchases ?? 0,
    roas: current?.roas ?? null,
    cpaMinor: current?.cpaMinor ?? null,
  };
}
