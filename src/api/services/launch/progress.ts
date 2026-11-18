import type {
  LaunchCheck,
  LaunchProgress,
  LaunchProgressQuery,
} from "../../../shared/schemas/launch";
import { isLaunchInFlight } from "../../../shared/launch-status";
import { notFound } from "../../lib/errors";
import {
  findLaunchProgress,
  type LaunchProgressRows,
} from "../../repositories/launch-progress";
import type { Scope } from "../../repositories/scope";

const POLL_INTERVAL_MS = 3000;

function toLaunchProgress({
  launch,
  items,
}: LaunchProgressRows): LaunchProgress {
  const updatedAt = Math.max(
    launch.updatedAt,
    ...items.map((item) => item.updatedAt),
  );
  return {
    status: launch.status,
    phase: launch.phase,
    counts: {
      total: launch.itemsTotal,
      done: launch.itemsDone,
      failed: launch.itemsFailed,
    },
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      status: item.status,
      adName: item.adName,
      metaAdId: item.metaAdId ?? undefined,
      error: item.errorMessage ?? undefined,
    })),
    checks: launch.checks
      ? (JSON.parse(launch.checks) as LaunchCheck[])
      : undefined,
    updatedAt: new Date(updatedAt).toISOString(),
    nextPollMs: isLaunchInFlight(launch.status) ? POLL_INTERVAL_MS : null,
  };
}

export async function getLaunchProgress(
  db: D1Database,
  scope: Scope,
  id: string,
  { since }: LaunchProgressQuery,
) {
  const found = await findLaunchProgress(
    db,
    scope,
    id,
    since === undefined ? undefined : Date.parse(since),
  );
  if (!found) throw notFound();
  return toLaunchProgress(found);
}
