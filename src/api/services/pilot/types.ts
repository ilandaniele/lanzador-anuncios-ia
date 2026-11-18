import type { PilotRule } from "../../../shared/schemas/pilot";
import type { MetricsRow } from "../metrics/aggregate";
import type { ScaleLimits } from "../scale-budget";

export type PilotAction = "pause" | "scale" | "duplicate";
export type PilotLevel = "campaign" | "adset" | "ad";
export type PilotRuleOf<Type extends PilotRule["ruleType"]> = Extract<
  PilotRule,
  { ruleType: Type }
>;

export interface ProductEconomics {
  priceMinor: number | null;
  costMinor: number | null;
}

export type ProposalEvidence = Record<string, string | number | null>;

export interface ProposalDraft {
  ruleType: PilotRule["ruleType"];
  action: PilotAction;
  adAccountId: string;
  level: PilotLevel;
  objectId: string;
  objectName: string;
  evidence: ProposalEvidence;
  currentBudgetMinor: number | null;
  proposedBudgetMinor: number | null;
  percent: number | null;
  dedupeKey: string;
  expiresAt: number;
}

export interface RuleRowSource {
  range: string;
  level: PilotLevel;
}

export interface RuleContext {
  rows: readonly MetricsRow[];
  products: ReadonlyMap<string, ProductEconomics>;
  limits: ScaleLimits;
  now: number;
}

export interface RulesInput {
  rules: readonly PilotRule[];
  rows: ReadonlyMap<string, readonly MetricsRow[]>;
  products: ReadonlyMap<string, ProductEconomics>;
  limits: ScaleLimits;
  pendingDedupeKeys: ReadonlySet<string>;
  now: number;
}
