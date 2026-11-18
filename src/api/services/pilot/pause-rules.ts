import type { MetricsRow } from "../metrics/aggregate";
import { metricsEvidence, toDraft } from "./draft";
import { targetCpaMinor } from "./thresholds";
import type { PilotRuleOf, ProposalDraft, RuleContext } from "./types";

const isPausable = (row: MetricsRow) =>
  row.status === "ACTIVE" && !row.protected;

export function pauseNoSales(
  { params }: PilotRuleOf<"pause_no_sales">,
  { rows, products, now }: RuleContext,
): ProposalDraft[] {
  return rows.flatMap((row) => {
    const targetCpa = targetCpaMinor(params, row, products);
    const spendThreshold = targetCpa * params.spendMultiplier;
    const matches =
      isPausable(row) &&
      row.purchases === 0 &&
      row.spendMinor > 0 &&
      row.spendMinor >= spendThreshold;
    if (!matches) return [];
    const evidence = {
      ...metricsEvidence(params.window, row),
      targetCpaMinor: targetCpa,
      spendThresholdMinor: spendThreshold,
    };
    return [
      toDraft({
        ruleType: "pause_no_sales",
        action: "pause",
        row,
        evidence,
        now,
      }),
    ];
  });
}

export function pauseLowRoas(
  { params }: PilotRuleOf<"pause_low_roas">,
  { rows, now }: RuleContext,
): ProposalDraft[] {
  return rows.flatMap((row) => {
    const matches =
      isPausable(row) &&
      row.roas !== null &&
      row.spendMinor >= params.minSpendMinor &&
      row.roas <= params.roasMax;
    if (!matches) return [];
    const evidence = {
      ...metricsEvidence(params.window, row),
      roasMax: params.roasMax,
    };
    return [
      toDraft({
        ruleType: "pause_low_roas",
        action: "pause",
        row,
        evidence,
        now,
      }),
    ];
  });
}
