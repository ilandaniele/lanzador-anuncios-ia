import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { aiUsage } from "../../db/schema/ops";
import { plans } from "../../db/schema/auth";
import { workspaces } from "../../db/schema/workspaces";
import type { UtcPeriods } from "../lib/time";
import {
  aiNeuronsQuery,
  foldAiNeurons,
  incrementAiNeuronsQuery,
} from "./usage-counters";

export type AiUsageRow = typeof aiUsage.$inferInsert;

export async function findAiBudgetState(
  db: D1Database,
  workspaceId: string,
  periods: UtcPeriods,
) {
  const orm = drizzle(db);
  const [[caps], neuronRows] = await orm.batch([
    orm
      .select({
        aiDailyNeuronsOverride: workspaces.aiDailyNeuronsOverride,
        aiMonthlyNeuronsOverride: workspaces.aiMonthlyNeuronsOverride,
        plan: {
          aiDailyNeurons: plans.aiDailyNeurons,
          aiMonthlyNeurons: plans.aiMonthlyNeurons,
        },
      })
      .from(workspaces)
      .innerJoin(plans, eq(plans.id, workspaces.planId))
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    aiNeuronsQuery(orm, workspaceId, periods),
  ]);
  if (!caps) return null;
  return { caps, neurons: foldAiNeurons(neuronRows, periods) };
}

export async function insertAiUsageWithCounters(
  db: D1Database,
  input: {
    workspaceId: string;
    rows: AiUsageRow[];
    neurons: number;
    periods: UtcPeriods;
    at: number;
  },
) {
  const { workspaceId, rows, neurons, periods, at } = input;
  const orm = drizzle(db);
  const insertRows = orm.insert(aiUsage).values(rows);
  if (neurons === 0) {
    await insertRows;
    return;
  }
  await orm.batch([
    insertRows,
    incrementAiNeuronsQuery(orm, workspaceId, periods, neurons, at),
  ]);
}
