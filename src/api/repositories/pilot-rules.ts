import { drizzle } from "drizzle-orm/d1";
import { pilotRules } from "../../db/schema/pilot";
import { newId } from "../lib/ids";

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
