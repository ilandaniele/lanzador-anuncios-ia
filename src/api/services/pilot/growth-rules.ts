import { metricsEvidence, toDraft } from "./draft";
import { fitScale } from "./scale-fit";
import { winnerMinRoas } from "./thresholds";
import type { PilotRuleOf, ProposalDraft, RuleContext } from "./types";

export function scaleWinner(
  { params }: PilotRuleOf<"scale_winner">,
  { rows, products, limits, now }: RuleContext,
): ProposalDraft[] {
  const range = `daily:last_${params.days}d`;
  return rows.flatMap((row) => {
    const minRoas = winnerMinRoas(params, row, products);
    const cooledDown =
      row.scaledHoursAgo === undefined ||
      row.scaledHoursAgo >= params.minHoursBetween;
    const matches =
      row.status === "ACTIVE" &&
      !row.protected &&
      cooledDown &&
      row.roas !== null &&
      row.spendMinor >= params.minSpendMinor &&
      row.roas >= minRoas;
    if (!matches || row.dailyBudgetMinor === undefined) return [];
    const fit = fitScale(row.dailyBudgetMinor, params.percent, limits);
    if (!fit) return [];
    return [
      toDraft({
        ruleType: "scale_winner",
        action: "scale",
        row,
        evidence: { ...metricsEvidence(range, row), minRoas },
        now,
        budget: {
          currentBudgetMinor: row.dailyBudgetMinor,
          proposedBudgetMinor: fit.budgetMinor,
          percent: fit.percent,
        },
      }),
    ];
  });
}

export function duplicateWinner(
  { params }: PilotRuleOf<"duplicate_winner">,
  { rows, now }: RuleContext,
): ProposalDraft[] {
  return rows.flatMap((row) => {
    const matches =
      !row.protected &&
      row.roas !== null &&
      row.spendMinor >= params.minSpendMinor &&
      row.roas >= params.minRoas;
    if (!matches) return [];
    const evidence = {
      ...metricsEvidence(params.range, row),
      minRoas: params.minRoas,
    };
    return [
      toDraft({
        ruleType: "duplicate_winner",
        action: "duplicate",
        row,
        evidence,
        now,
      }),
    ];
  });
}
