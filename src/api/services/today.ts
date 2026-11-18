import {
  type TodayResponse,
  TODAY_LAST_LAUNCHES,
  TODAY_TOP_PROPOSALS,
} from "../../shared/schemas/today";
import type { Env } from "../env";
import { now, toIsoOrNull } from "../lib/time";
import { selectTodayRows } from "../repositories/today";
import type { Scope } from "../repositories/scope";
import { toLaunchListItem } from "./launch/launch-dto";
import { toPilotProposalDto } from "./pilot/dto";
import { toTodayAccount } from "./today/accounts";
import { buildAlerts } from "./today/alerts";
import { loadTodayInsights } from "./today/insights";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_WARNING_MS = 7 * DAY_MS;
const LAUNCH_ERRORS_WINDOW_MS = 7 * DAY_MS;

export async function getToday(
  env: Env,
  scope: Scope,
  at: number = now(),
): Promise<TodayResponse> {
  const [insights, rows] = await Promise.all([
    loadTodayInsights(env, scope, at),
    selectTodayRows(env.DB, scope, {
      tokenExpiresBefore: at + TOKEN_WARNING_MS,
      launchErrorsSince: at - LAUNCH_ERRORS_WINDOW_MS,
    }),
  ]);
  return {
    accounts: insights.views.map((view) => toTodayAccount(view, at)),
    alerts: buildAlerts(rows, insights.views, at),
    proposals: {
      pendingCount: rows.pending.length,
      top: rows.pending.slice(0, TODAY_TOP_PROPOSALS).map(toPilotProposalDto),
    },
    launches: rows.recentLaunches
      .slice(0, TODAY_LAST_LAUNCHES)
      .map(toLaunchListItem),
    updatedAt: toIsoOrNull(insights.updatedAt),
    stale: insights.stale,
  };
}
