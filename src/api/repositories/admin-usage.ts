import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { usageCounters } from "../../db/schema/ops";
import { workspaces } from "../../db/schema/workspaces";
import { GLOBAL_SCOPE_ID } from "./usage-counters";

const monthlyCounter = (metric: string, month: string, alias: string) =>
  sql<number>`coalesce((SELECT ${usageCounters.value}
    FROM ${usageCounters}
    WHERE ${usageCounters.scope} = 'workspace'
      AND ${usageCounters.scopeId} = ${workspaces.id}
      AND ${usageCounters.period} = ${month}
      AND ${usageCounters.metric} = ${metric}), 0)`.as(alias);

export async function selectUsagePage(
  db: D1Database,
  periods: { month: string; day: string },
  page: { after?: string; size: number },
) {
  const orm = drizzle(db);
  const [rows, [global]] = await orm.batch([
    orm
      .select({
        id: workspaces.id,
        name: workspaces.name,
        neurons: monthlyCounter("ai_neurons", periods.month, "neurons"),
        metaCalls: monthlyCounter("meta_calls", periods.month, "metaCalls"),
      })
      .from(workspaces)
      .where(page.after ? gt(workspaces.id, page.after) : undefined)
      .orderBy(workspaces.id)
      .limit(page.size + 1),
    orm
      .select({ value: usageCounters.value })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.scope, "global"),
          eq(usageCounters.scopeId, GLOBAL_SCOPE_ID),
          eq(usageCounters.period, periods.day),
          eq(usageCounters.metric, "ai_neurons"),
        ),
      )
      .limit(1),
  ]);
  return { rows, neuronsToday: global?.value ?? 0 };
}
