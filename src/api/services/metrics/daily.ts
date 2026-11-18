import { roas } from "../../../shared/metrics";
import type { DailyPointDto } from "../../../shared/schemas/metrics";
import type { InsightRow } from "../../integrations/meta/read";
import type { AccountInsights } from "./aggregate";

export function dailySeries(accounts: AccountInsights[]): DailyPointDto[] {
  const points = new Map<string, Omit<DailyPointDto, "roas">>();
  for (const { currency, rows } of accounts) {
    for (const row of rows as InsightRow[]) {
      const key = `${row.date}|${currency}`;
      const point = points.get(key) ?? {
        date: row.date,
        currency,
        spendMinor: 0,
        purchases: 0,
        purchaseValueMinor: 0,
      };
      point.spendMinor += row.spendMinor;
      point.purchases += row.purchases;
      point.purchaseValueMinor += row.purchaseValueMinor;
      points.set(key, point);
    }
  }
  return [...points.values()]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency),
    )
    .map((point) => ({
      ...point,
      roas: roas(point.purchaseValueMinor, point.spendMinor),
    }));
}
