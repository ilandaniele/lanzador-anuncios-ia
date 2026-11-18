import type { InsightRange } from "../../../shared/insight-range";
import { resolveWindow } from "../../../shared/insight-range";
import { unprocessable } from "../../lib/errors";
import { selectMetricsAccounts } from "../../repositories/metrics";
import type { Scope } from "../../repositories/scope";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "../insights/refresh";

export interface MetricsAccount {
  id: string;
  metaId: string;
  currency: string;
  timezone: string;
}

export async function listMetricsAccounts(
  db: D1Database,
  scope: Scope,
  adAccountIds?: string[],
): Promise<MetricsAccount[]> {
  const accounts = await selectMetricsAccounts(db, scope);
  return accounts
    .filter(({ id }) => !adAccountIds || adAccountIds.includes(id))
    .map(({ id, metaId, currency, timezoneName }) => ({
      id,
      metaId,
      currency: currency ?? DEFAULT_CURRENCY,
      timezone: timezoneName ?? DEFAULT_TIMEZONE,
    }));
}

export function assertRange(
  range: InsightRange,
  accounts: MetricsAccount[],
  at: number,
): void {
  const timezones = accounts.length
    ? accounts.map(({ timezone }) => timezone)
    : [DEFAULT_TIMEZONE];
  try {
    for (const timezone of new Set(timezones)) {
      resolveWindow(range, timezone, new Date(at));
    }
  } catch (error) {
    if (error instanceof RangeError) throw unprocessable("RANGE_INVALID");
    throw error;
  }
}
