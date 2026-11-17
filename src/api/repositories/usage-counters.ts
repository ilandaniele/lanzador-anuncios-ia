import { and, eq, inArray, or } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { usageCounters } from "../../db/schema/ops";
import type { UtcPeriods } from "../lib/time";

export type AiNeurons = {
  workspaceDay: number;
  workspaceMonth: number;
  globalDay: number;
};

const GLOBAL_SCOPE_ID = "app";

export const aiNeuronsQuery = (
  orm: DrizzleD1Database,
  workspaceId: string,
  { day, month }: UtcPeriods,
) =>
  orm
    .select({
      scope: usageCounters.scope,
      period: usageCounters.period,
      value: usageCounters.value,
    })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.metric, "ai_neurons"),
        or(
          and(
            eq(usageCounters.scope, "workspace"),
            eq(usageCounters.scopeId, workspaceId),
            inArray(usageCounters.period, [day, month]),
          ),
          and(
            eq(usageCounters.scope, "global"),
            eq(usageCounters.scopeId, GLOBAL_SCOPE_ID),
            eq(usageCounters.period, day),
          ),
        ),
      ),
    );

export function foldAiNeurons(
  rows: Awaited<ReturnType<typeof aiNeuronsQuery>>,
  { day }: UtcPeriods,
): AiNeurons {
  const neurons: AiNeurons = {
    workspaceDay: 0,
    workspaceMonth: 0,
    globalDay: 0,
  };
  for (const { scope, period, value } of rows) {
    if (scope === "global") neurons.globalDay = value;
    else if (period === day) neurons.workspaceDay = value;
    else neurons.workspaceMonth = value;
  }
  return neurons;
}

export async function readAiNeurons(
  db: D1Database,
  workspaceId: string,
  periods: UtcPeriods,
): Promise<AiNeurons> {
  const rows = await aiNeuronsQuery(drizzle(db), workspaceId, periods);
  return foldAiNeurons(rows, periods);
}
