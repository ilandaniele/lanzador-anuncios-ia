import type {
  TagDimension,
  WinningTagDto,
  WinningTagsQuery,
} from "../../../shared/schemas/metrics";
import type { Env } from "../../env";
import { groupBy } from "../../lib/group-by";
import { now } from "../../lib/time";
import { selectAdTags } from "../../repositories/metrics";
import type { Scope } from "../../repositories/scope";
import { loadAdRows } from "./ad-rows";
import { type MetricsRow, totalsByCurrency } from "./aggregate";

const MAX_WINNING_TAGS = 50;

const tagLabel = (dimension: TagDimension, value: string | number) =>
  dimension === "onScreenText" ? String(value === 1) : String(value);

const byRoasThenSpend = (a: WinningTagDto, b: WinningTagDto) =>
  (b.roas ?? -1) - (a.roas ?? -1) ||
  b.spendMinor - a.spendMinor ||
  a.tag.localeCompare(b.tag);

const tagStats = (tag: string, rows: MetricsRow[]): WinningTagDto[] =>
  totalsByCurrency(rows).map(
    ({ currency, spendMinor, purchases, roas, cpaMinor }) => ({
      tag,
      currency,
      ads: rows.filter((row) => row.currency === currency).length,
      spendMinor,
      purchases,
      roas,
      cpaMinor,
    }),
  );

export async function winningTags(
  env: Env,
  scope: Scope,
  { range, dimension }: WinningTagsQuery,
  at: number = now(),
): Promise<{ data: WinningTagDto[] }> {
  const rows = (await loadAdRows(env, scope, range, at)).filter(
    ({ spendMinor }) => spendMinor > 0,
  );
  const tags = await selectAdTags(
    env.DB,
    scope,
    rows.map(({ id }) => id),
    dimension,
  );
  const tagByAd = new Map(
    tags.flatMap(({ adId, value }) =>
      adId && value !== null
        ? [[adId, tagLabel(dimension, value)] as const]
        : [],
    ),
  );
  const rowsByTag = groupBy(
    rows.filter(({ id }) => tagByAd.has(id)),
    ({ id }) => tagByAd.get(id)!,
  );
  return {
    data: [...rowsByTag]
      .flatMap(([tag, tagRows]) => tagStats(tag, tagRows))
      .sort(byRoasThenSpend)
      .slice(0, MAX_WINNING_TAGS),
  };
}
