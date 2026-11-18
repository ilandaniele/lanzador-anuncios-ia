import { and, eq, inArray, or, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { usageCounters } from "../../db/schema/ops";
import type { UtcPeriods } from "../lib/time";

export type AiNeurons = {
  workspaceDay: number;
  workspaceMonth: number;
  globalDay: number;
};

export const GLOBAL_SCOPE_ID = "app";

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

export const incrementAiNeuronsQuery = (
  orm: DrizzleD1Database,
  workspaceId: string,
  { day, month }: UtcPeriods,
  neurons: number,
  at: number,
) => {
  const counter = (scope: "workspace" | "global", period: string) => ({
    scope,
    scopeId: scope === "global" ? GLOBAL_SCOPE_ID : workspaceId,
    period,
    metric: "ai_neurons",
    value: neurons,
    updatedAt: at,
  });
  return orm
    .insert(usageCounters)
    .values([
      counter("workspace", day),
      counter("workspace", month),
      counter("global", day),
    ])
    .onConflictDoUpdate({
      target: [
        usageCounters.scope,
        usageCounters.scopeId,
        usageCounters.period,
        usageCounters.metric,
      ],
      set: {
        value: sql`${usageCounters.value} + excluded.value`,
        updatedAt: at,
      },
    });
};
