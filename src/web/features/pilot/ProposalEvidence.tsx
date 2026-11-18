import type { ReactNode } from "react";
import type { PILOT_RULE_TYPES } from "../../../shared/constants";
import type { PilotProposalDto } from "../../../shared/schemas/pilot";
import { t, type TextKey } from "../../i18n/es-AR";
import { formatRoas } from "../../lib/format-roas";
import { formatMoney } from "../../lib/money";
import { NO_VALUE } from "../metrics/metric-format";
import { RoasValue } from "../metrics/RoasValue";

type StatKey =
  | "spend"
  | "purchases"
  | "roas"
  | "minRoas"
  | "maxRoas"
  | "targetCpa"
  | "spendLimit";

const STAT_KEYS: Record<(typeof PILOT_RULE_TYPES)[number], StatKey[]> = {
  pause_no_sales: ["spend", "purchases", "targetCpa", "spendLimit"],
  pause_low_roas: ["roas", "maxRoas", "spend", "purchases"],
  scale_winner: ["roas", "minRoas", "spend", "purchases"],
  duplicate_winner: ["roas", "minRoas", "spend", "purchases"],
};

const STAT_LABELS: Record<StatKey, TextKey> = {
  spend: "pilot.evidence.spend",
  purchases: "pilot.evidence.purchases",
  roas: "pilot.evidence.roas",
  minRoas: "pilot.evidence.minRoas",
  maxRoas: "pilot.evidence.maxRoas",
  targetCpa: "pilot.evidence.targetCpa",
  spendLimit: "pilot.evidence.spendLimit",
};

type ProposalEvidenceProps = {
  proposal: PilotProposalDto;
  currency?: string;
};

export function ProposalEvidence({
  proposal: { ruleType, evidence },
  currency,
}: ProposalEvidenceProps) {
  const numberAt = (key: string) => {
    const value = evidence[key];
    return typeof value === "number" ? value : null;
  };
  const moneyAt = (key: string) => {
    const minor = numberAt(key);
    return minor === null ? NO_VALUE : formatMoney(minor, currency);
  };
  const roasAt = (key: string) => {
    const roas = numberAt(key);
    return roas === null ? NO_VALUE : formatRoas(roas);
  };
  const equilibrium =
    ruleType === "pause_low_roas" ? null : numberAt("minRoas");

  const values: Record<StatKey, ReactNode> = {
    spend: moneyAt("spendMinor"),
    purchases: numberAt("purchases") ?? NO_VALUE,
    roas: <RoasValue roas={numberAt("roas")} breakEvenRoas={equilibrium} />,
    minRoas: roasAt("minRoas"),
    maxRoas: roasAt("roasMax"),
    targetCpa: moneyAt("targetCpaMinor"),
    spendLimit: moneyAt("spendThresholdMinor"),
  };

  return (
    <dl
      aria-label={t("pilot.evidence.label")}
      className="grid gap-x-6 sm:grid-cols-2"
    >
      {STAT_KEYS[ruleType].map((key) => (
        <div
          key={key}
          className="flex justify-between gap-4 border-b border-rule py-2"
        >
          <dt className="text-ink-muted">{t(STAT_LABELS[key])}</dt>
          <dd className="text-right tabular-nums">{values[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
