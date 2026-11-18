import { MAX_SCALE_PERCENT } from "../../shared/constants";
import type { PilotRule, PilotRulesResponse } from "../../shared/schemas/pilot";
import { unprocessable } from "../lib/errors";
import { now } from "../lib/time";
import { findPilotRules, upsertPilotRules } from "../repositories/pilot-rules";
import type { Scope } from "../repositories/scope";
import { manualAuditEntry } from "./audit-entry";

export async function listPilotRules(
  db: D1Database,
  scope: Scope,
): Promise<PilotRulesResponse> {
  return { data: await findPilotRules(db, scope) };
}

export async function updatePilotRules(
  db: D1Database,
  scope: Scope,
  rules: PilotRule[],
  requestId: string,
): Promise<PilotRulesResponse> {
  const exceedsScaleCap = rules.some(
    (rule) =>
      rule.ruleType === "scale_winner" &&
      rule.params.percent > MAX_SCALE_PERCENT,
  );
  if (exceedsScaleCap) throw unprocessable("SCALE_PERCENT_MAX_50");
  const audit = manualAuditEntry(scope, requestId, {
    action: "pilot.rules.update",
    objectType: "pilot_rules",
    detail: { rules },
  });
  await upsertPilotRules(db, scope, rules, audit, now());
  return listPilotRules(db, scope);
}
