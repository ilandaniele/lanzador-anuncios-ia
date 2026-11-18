import { PILOT_RULE_TYPES } from "../../../shared/constants";
import type { PilotRule } from "../../../shared/schemas/pilot";
import { duplicateWinner, scaleWinner } from "./growth-rules";
import { pauseLowRoas, pauseNoSales } from "./pause-rules";
import { rowSourceKey, ruleRowSource } from "./row-source";
import type { ProposalDraft, RuleContext, RulesInput } from "./types";

export { dedupeKey } from "./draft";
export { rowSourceKey, ruleRowSource } from "./row-source";
export type * from "./types";

function evaluateRule(rule: PilotRule, context: RuleContext): ProposalDraft[] {
  switch (rule.ruleType) {
    case "pause_no_sales":
      return pauseNoSales(rule, context);
    case "pause_low_roas":
      return pauseLowRoas(rule, context);
    case "scale_winner":
      return scaleWinner(rule, context);
    case "duplicate_winner":
      return duplicateWinner(rule, context);
  }
}

const byRuleOrder = (a: PilotRule, b: PilotRule) =>
  PILOT_RULE_TYPES.indexOf(a.ruleType) - PILOT_RULE_TYPES.indexOf(b.ruleType);

export function evaluateRules(input: RulesInput): ProposalDraft[] {
  const { rules, rows, products, limits, pendingDedupeKeys, now } = input;
  const taken = new Set(pendingDedupeKeys);
  const drafts: ProposalDraft[] = [];
  const enabledRules = rules.filter(({ enabled }) => enabled).sort(byRuleOrder);
  for (const rule of enabledRules) {
    const sourceRows = rows.get(rowSourceKey(ruleRowSource(rule))) ?? [];
    const context = { rows: sourceRows, products, limits, now };
    for (const draft of evaluateRule(rule, context)) {
      if (taken.has(draft.dedupeKey)) continue;
      taken.add(draft.dedupeKey);
      drafts.push(draft);
    }
  }
  return drafts;
}
