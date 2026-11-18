import { and, asc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { plans } from "../../db/schema/auth";
import { creatives } from "../../db/schema/creatives";
import { usageCounters } from "../../db/schema/ops";
import { workspaces } from "../../db/schema/workspaces";
import type { CreativeAiStatus } from "../../shared/schemas/creatives";
import type { UtcPeriods } from "../lib/time";
import { GLOBAL_SCOPE_ID } from "./usage-counters";

const neuronsUsed = (
  scope: "workspace" | "global",
  scopeId: unknown,
  period: string,
) =>
  sql`coalesce((SELECT ${usageCounters.value} FROM ${usageCounters}
    WHERE ${usageCounters.scope} = ${scope}
      AND ${usageCounters.scopeId} = ${scopeId}
      AND ${usageCounters.period} = ${period}
      AND ${usageCounters.metric} = 'ai_neurons'), 0)`;

export interface PendingTag {
  id: string;
  workspaceId: string;
}

export interface RetagLimits {
  neuronsPerTag: number;
  perWorkspace: number;
  total: number;
}

const tagsThatFit = (cap: unknown, used: SQL, neuronsPerTag: number) =>
  sql`cast((${cap} - ${used}) / ${neuronsPerTag} as integer)`;

export function selectPendingTagsWithBudget(
  db: D1Database,
  { day, month }: Pick<UtcPeriods, "day" | "month">,
  globalDailyCap: number,
  { neuronsPerTag, perWorkspace, total }: RetagLimits,
): Promise<PendingTag[]> {
  const orm = drizzle(db);
  const ranked = orm
    .select({
      id: creatives.id,
      workspaceId: creatives.workspaceId,
      createdAt: creatives.createdAt,
      workspaceRank:
        sql<number>`row_number() over (partition by ${creatives.workspaceId} order by ${creatives.createdAt}, ${creatives.id})`.as(
          "workspace_rank",
        ),
      workspaceAllowance: sql<number>`min(${perWorkspace}, ${tagsThatFit(
        sql`coalesce(${workspaces.aiDailyNeuronsOverride}, ${plans.aiDailyNeurons})`,
        neuronsUsed("workspace", workspaces.id, day),
        neuronsPerTag,
      )}, ${tagsThatFit(
        sql`coalesce(${workspaces.aiMonthlyNeuronsOverride}, ${plans.aiMonthlyNeurons})`,
        neuronsUsed("workspace", workspaces.id, month),
        neuronsPerTag,
      )})`.as("workspace_allowance"),
    })
    .from(creatives)
    .innerJoin(workspaces, eq(workspaces.id, creatives.workspaceId))
    .innerJoin(plans, eq(plans.id, workspaces.planId))
    .where(
      and(
        eq(creatives.aiStatus, "pending"),
        eq(creatives.status, "ready"),
        isNotNull(creatives.thumbnailUrl),
        eq(workspaces.status, "active"),
      ),
    )
    .as("ranked");
  const fitting = orm
    .select({
      id: ranked.id,
      workspaceId: ranked.workspaceId,
      globalRank:
        sql<number>`row_number() over (order by ${ranked.createdAt}, ${ranked.id})`.as(
          "global_rank",
        ),
    })
    .from(ranked)
    .where(sql`${ranked.workspaceRank} <= ${ranked.workspaceAllowance}`)
    .as("fitting");
  return orm
    .select({ id: fitting.id, workspaceId: fitting.workspaceId })
    .from(fitting)
    .where(
      sql`${fitting.globalRank} <= ${tagsThatFit(
        globalDailyCap,
        neuronsUsed("global", GLOBAL_SCOPE_ID, day),
        neuronsPerTag,
      )}`,
    )
    .orderBy(asc(fitting.globalRank))
    .limit(total);
}

export async function moveAiStatus(
  db: D1Database,
  ids: string[],
  { from, to }: { from: CreativeAiStatus; to: CreativeAiStatus },
  at: number,
): Promise<void> {
  if (ids.length === 0) return;
  await drizzle(db)
    .update(creatives)
    .set({ aiStatus: to, updatedAt: at })
    .where(and(inArray(creatives.id, ids), eq(creatives.aiStatus, from)));
}
