import { drizzle } from "drizzle-orm/d1";
import { pilotRules } from "../../db/schema/pilot";
import type { PilotRule } from "../../shared/schemas/pilot";
import { newId } from "../lib/ids";
import { auditStatement, type AuditEntry } from "./audit";
import { inWorkspace, type Scope } from "./scope";

export const DEFAULT_PILOT_RULES = [
  {
    ruleType: "pause_no_sales",
    enabled: 1,
    params: {
      level: "ad",
      targetCpaSource: "product_margin",
      fallbackTargetCpaMinor: 1500,
      spendMultiplier: 2,
      window: "today",
    },
  },
  {
    ruleType: "pause_low_roas",
    enabled: 0,
    params: {
      level: "campaign",
      roasMax: 1.0,
      minSpendMinor: 3000,
      window: "daily:last_3d",
    },
  },
  {
    ruleType: "scale_winner",
    enabled: 0,
    params: {
      breakEvenMultiplier: 1.3,
      fallbackMinRoas: 2.5,
      days: 3,
      minSpendMinor: 1500,
      percent: 30,
      minHoursBetween: 24,
    },
  },
  {
    ruleType: "duplicate_winner",
    enabled: 0,
    params: { minRoas: 2.0, minSpendMinor: 3000, range: "last_7d" },
  },
];

export const insertDefaultPilotRules = (
  db: D1Database,
  workspaceId: string,
  at: number,
) =>
  drizzle(db)
    .insert(pilotRules)
    .values(
      DEFAULT_PILOT_RULES.map(({ ruleType, enabled, params }) => ({
        id: newId(),
        workspaceId,
        ruleType,
        enabled,
        params: JSON.stringify(params),
        updatedAt: at,
      })),
    );

const toPilotRule = (row: {
  ruleType: string;
  enabled: number;
  params: string;
}) =>
  ({
    ruleType: row.ruleType,
    enabled: row.enabled === 1,
    params: JSON.parse(row.params),
  }) as PilotRule;

export async function findPilotRules(
  db: D1Database,
  scope: Scope,
): Promise<PilotRule[]> {
  const rows = await drizzle(db)
    .select({
      ruleType: pilotRules.ruleType,
      enabled: pilotRules.enabled,
      params: pilotRules.params,
    })
    .from(pilotRules)
    .where(inWorkspace(pilotRules, scope))
    .orderBy(pilotRules.ruleType);
  return rows.map(toPilotRule);
}

export async function upsertPilotRules(
  db: D1Database,
  scope: Scope,
  rules: PilotRule[],
  audit: AuditEntry,
  at: number,
) {
  const orm = drizzle(db);
  await orm.batch([
    auditStatement(db, audit),
    ...rules.map((rule) => {
      const columns = {
        enabled: Number(rule.enabled),
        params: JSON.stringify(rule.params),
        updatedBy: scope.userId,
        updatedAt: at,
      };
      return orm
        .insert(pilotRules)
        .values({
          ...columns,
          id: newId(),
          workspaceId: scope.workspaceId,
          ruleType: rule.ruleType,
        })
        .onConflictDoUpdate({
          target: [pilotRules.workspaceId, pilotRules.ruleType],
          set: columns,
        });
    }),
  ]);
}
