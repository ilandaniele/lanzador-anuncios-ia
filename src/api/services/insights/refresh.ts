import {
  type DateWindow,
  dayInZone,
  type InsightRange,
  RANGE_PRESETS,
  type RangePreset,
  resolveWindow,
} from "../../../shared/insight-range";
import type { Env } from "../../env";
import type { Graph } from "../../integrations/meta/client";
import {
  readAccountHealth,
  readInsights,
  readIssues,
} from "../../integrations/meta/read";
import { AppError } from "../../lib/errors";
import { now } from "../../lib/time";
import {
  acquireRefreshLease,
  type InsightCacheLevel,
  type InsightsCacheKey,
  recordRefreshError,
  storeInsights,
} from "../../repositories/insights-cache";
import { selectAssets } from "../../repositories/meta-assets";
import type { Scope } from "../../repositories/scope";
import { getGraphForAsset } from "../meta/connection";
import { rethrowMetaError } from "../meta/meta-error";

const MINUTE_MS = 60_000;
const TODAY_TTL_MS = 15 * MINUTE_MS;
const PAST_TTL_MS = 6 * 60 * MINUTE_MS;
const LEASE_MS = 5 * MINUTE_MS;
export const MAX_BLOB_ROWS = 1000;
const MAX_AD_ACCOUNTS = 100;
export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_CURRENCY = "USD";
const DAILY_PREFIX = "daily:";
const CUSTOM_PREFIX = "custom";

interface AdAccount {
  metaId: string;
  currency: string | null;
  timezoneName: string | null;
}

interface RangeSpec {
  range: InsightRange;
  daily: boolean;
}

const invalidRange = () => new RangeError("RANGE_INVALID");

const isPreset = (value: string): value is RangePreset =>
  (RANGE_PRESETS as readonly string[]).includes(value);

export function parseRangeKey(rangeKey: string): RangeSpec {
  const daily = rangeKey.startsWith(DAILY_PREFIX);
  const base = daily ? rangeKey.slice(DAILY_PREFIX.length) : rangeKey;
  if (isPreset(base)) return { range: { preset: base }, daily };
  const [prefix, from, to, ...rest] = base.split(":");
  if (prefix !== CUSTOM_PREFIX || !from || !to || rest.length > 0) {
    throw invalidRange();
  }
  return { range: { from, to }, daily };
}

export const toRangeKey = (range: InsightRange, daily = false): string => {
  const base =
    "preset" in range
      ? range.preset
      : `${CUSTOM_PREFIX}:${range.from}:${range.to}`;
  return daily ? `${DAILY_PREFIX}${base}` : base;
};

async function fetchRows(
  graph: Graph,
  account: AdAccount,
  level: InsightCacheLevel,
  { range, daily }: RangeSpec,
  at: number,
): Promise<unknown[]> {
  if (level === "health")
    return [await readAccountHealth(graph, account.metaId)];
  if (level === "issues") return readIssues(graph, account.metaId);
  const { rows } = await readInsights(
    graph,
    {
      actId: account.metaId,
      level,
      range,
      currency: account.currency ?? DEFAULT_CURRENCY,
      timezone: account.timezoneName ?? DEFAULT_TIMEZONE,
      daily,
    },
    new Date(at),
  );
  return rows;
}

const ttlFor = (window: DateWindow, timezone: string, at: number) =>
  window.until === dayInZone(new Date(at), timezone)
    ? TODAY_TTL_MS
    : PAST_TTL_MS;

const errorCode = (error: unknown) =>
  error instanceof AppError ? error.code : "INTERNAL";

export async function refreshInsights(
  env: Env,
  scope: Scope,
  key: InsightsCacheKey,
  at: number = now(),
  { force = false }: { force?: boolean } = {},
): Promise<boolean> {
  const spec = parseRangeKey(key.rangeKey);
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    key.adAccountAssetId,
  );
  const timezone = asset.timezoneName ?? DEFAULT_TIMEZONE;
  const window = resolveWindow(spec.range, timezone, new Date(at));
  const dates = { dateFrom: window.since, dateTo: window.until };
  const leased = await acquireRefreshLease(env.DB, scope, key, dates, {
    at,
    until: at + LEASE_MS,
    force,
  });
  if (!leased) return false;
  try {
    const rows = await fetchRows(graph, asset, key.level, spec, at).catch(
      rethrowMetaError,
    );
    await storeInsights(env.DB, scope, key, {
      ...dates,
      rows: rows.slice(0, MAX_BLOB_ROWS),
      fetchedAt: at,
      expiresAt: at + ttlFor(window, timezone, at),
    });
    return true;
  } catch (error) {
    await recordRefreshError(env.DB, scope, key, errorCode(error));
    throw error;
  }
}

export async function enabledAdAccountIds(
  db: D1Database,
  scope: Scope,
): Promise<string[]> {
  const assets = await selectAssets(db, scope, {
    kind: "ad_account",
    enabled: true,
    size: MAX_AD_ACCOUNTS,
  });
  return assets.slice(0, MAX_AD_ACCOUNTS).map(({ id }) => id);
}
