import type {
  AdminUsageDto,
  AdminUsageQuery,
} from "../../shared/schemas/admin";
import { decodeCursor, paginate } from "../lib/cursor";
import { now, utcPeriods } from "../lib/time";
import { selectUsagePage } from "../repositories/admin-usage";

export async function getAdminUsage(
  db: D1Database,
  { cursor, limit, month }: AdminUsageQuery,
): Promise<AdminUsageDto> {
  const periods = utcPeriods(now());
  const { rows, neuronsToday } = await selectUsagePage(
    db,
    { month: month ?? periods.month, day: periods.day },
    { after: cursor ? decodeCursor(cursor).id : undefined, size: limit },
  );
  const page = paginate(rows, limit);
  return {
    workspaces: page.rows,
    global: { neuronsToday },
    nextCursor: page.nextCursor,
  };
}
