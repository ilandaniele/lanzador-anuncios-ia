import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { launches } from "../../db/schema/launches";
import { metaConnections } from "../../db/schema/meta";
import type { ConnectionStatus } from "../../shared/constants";
import type { LaunchStatus } from "../../shared/schemas/launch";
import {
  PENDING_COUNT_CAP,
  TODAY_LAST_LAUNCHES,
} from "../../shared/schemas/today";
import { selectLaunches } from "./launches";
import { selectPilotProposals } from "./pilot";
import { inWorkspace, type Scope } from "./scope";

const MAX_ALERT_ROWS = 20;
const LAUNCH_ERROR_STATUSES = ["failed", "verified_with_errors"];

export interface TodayWindow {
  tokenExpiresBefore: number;
  launchErrorsSince: number;
}

const selectAlertConnections = (
  db: D1Database,
  scope: Scope,
  expiresBefore: number,
) =>
  drizzle(db)
    .select({
      id: metaConnections.id,
      businessName: metaConnections.businessName,
      status: sql<ConnectionStatus>`${metaConnections.status}`,
      tokenExpiresAt: metaConnections.tokenExpiresAt,
    })
    .from(metaConnections)
    .where(
      and(
        inWorkspace(metaConnections, scope),
        or(
          eq(metaConnections.status, "reconnect_required"),
          and(
            isNotNull(metaConnections.tokenExpiresAt),
            lte(metaConnections.tokenExpiresAt, expiresBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(metaConnections.createdAt), asc(metaConnections.id))
    .limit(MAX_ALERT_ROWS);

const selectLaunchErrors = (db: D1Database, scope: Scope, since: number) =>
  drizzle(db)
    .select({
      id: launches.id,
      status: sql<LaunchStatus>`${launches.status}`,
      campaignName: sql<
        string | null
      >`json_extract(${launches.draft}, '$.campaignName')`,
    })
    .from(launches)
    .where(
      and(
        inWorkspace(launches, scope),
        inArray(launches.status, LAUNCH_ERROR_STATUSES),
        gte(launches.createdAt, since),
      ),
    )
    .orderBy(desc(launches.createdAt), desc(launches.id))
    .limit(MAX_ALERT_ROWS);

export async function selectTodayRows(
  db: D1Database,
  scope: Scope,
  { tokenExpiresBefore, launchErrorsSince }: TodayWindow,
) {
  const [recentLaunches, [pending, connections, launchErrors]] =
    await Promise.all([
      selectLaunches(db, scope, { size: TODAY_LAST_LAUNCHES }),
      drizzle(db).batch([
        selectPilotProposals(db, scope, {
          status: "pending",
          size: PENDING_COUNT_CAP - 1,
        }),
        selectAlertConnections(db, scope, tokenExpiresBefore),
        selectLaunchErrors(db, scope, launchErrorsSince),
      ]),
    ]);
  return { pending, recentLaunches, connections, launchErrors };
}

export type TodayRows = Awaited<ReturnType<typeof selectTodayRows>>;
