import type { MetricsRow } from "../metrics/aggregate";
import type {
  PilotAction,
  PilotLevel,
  ProposalDraft,
  ProposalEvidence,
} from "./types";

const PROPOSAL_TTL_MS = 12 * 3_600_000;

export const dedupeKey = (action: PilotAction, objectId: string) =>
  `${action}:${objectId}`;

export const metricsEvidence = (
  range: string,
  row: MetricsRow,
): ProposalEvidence => ({
  range,
  spendMinor: row.spendMinor,
  purchases: row.purchases,
  purchaseValueMinor: row.purchaseValueMinor,
  roas: row.roas,
  cpaMinor: row.cpaMinor,
});

export interface DraftInput {
  ruleType: ProposalDraft["ruleType"];
  action: PilotAction;
  row: MetricsRow;
  evidence: ProposalEvidence;
  now: number;
  budget?: Pick<
    ProposalDraft,
    "currentBudgetMinor" | "proposedBudgetMinor" | "percent"
  >;
}

export const toDraft = ({
  ruleType,
  action,
  row,
  evidence,
  now,
  budget,
}: DraftInput): ProposalDraft => ({
  ruleType,
  action,
  adAccountId: row.adAccountId,
  level: row.level as PilotLevel,
  objectId: row.id,
  objectName: row.name,
  evidence,
  currentBudgetMinor: budget?.currentBudgetMinor ?? null,
  proposedBudgetMinor: budget?.proposedBudgetMinor ?? null,
  percent: budget?.percent ?? null,
  dedupeKey: dedupeKey(action, row.id),
  expiresAt: now + PROPOSAL_TTL_MS,
});
