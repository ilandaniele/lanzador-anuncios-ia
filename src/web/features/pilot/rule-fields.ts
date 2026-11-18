import type { PilotRule } from "../../../shared/schemas/pilot";
import type { TextKey } from "../../i18n/es-AR";

export type RuleType = PilotRule["ruleType"];

type ParamKeys<Rule> = Rule extends { params: infer Params }
  ? keyof Params & string
  : never;
export type FieldKey = ParamKeys<PilotRule>;

type ChoiceOption = { value: string; label: TextKey };

export type FieldSpec =
  | { key: FieldKey; kind: "number" | "money" }
  | { key: FieldKey; kind: "choice"; options: readonly ChoiceOption[] };

const number = (key: FieldKey): FieldSpec => ({ key, kind: "number" });
const money = (key: FieldKey): FieldSpec => ({ key, kind: "money" });
const choice = (
  key: FieldKey,
  options: readonly ChoiceOption[],
): FieldSpec => ({
  key,
  kind: "choice",
  options,
});

const LEVELS = [
  { value: "campaign", label: "pilot.rules.option.campaign" },
  { value: "adset", label: "pilot.rules.option.adset" },
  { value: "ad", label: "pilot.rules.option.ad" },
] as const;

const TARGET_CPA_SOURCES = [
  { value: "product_margin", label: "pilot.rules.option.productMargin" },
  { value: "fixed", label: "pilot.rules.option.fixed" },
] as const;

const NO_SALES_WINDOWS = [
  { value: "today", label: "pilot.rules.option.today" },
  { value: "yesterday", label: "pilot.rules.option.yesterday" },
] as const;

const LOW_ROAS_WINDOWS = [
  { value: "daily:last_3d", label: "pilot.rules.option.last3d" },
  { value: "daily:last_7d", label: "pilot.rules.option.last7d" },
] as const;

const DUPLICATE_RANGES = [
  { value: "last_7d", label: "pilot.rules.option.last7d" },
  { value: "last_14d", label: "pilot.rules.option.last14d" },
  { value: "last_30d", label: "pilot.rules.option.last30d" },
] as const;

export const RULE_FIELDS: Record<RuleType, readonly FieldSpec[]> = {
  pause_no_sales: [
    choice("level", LEVELS),
    number("spendMultiplier"),
    choice("window", NO_SALES_WINDOWS),
    choice("targetCpaSource", TARGET_CPA_SOURCES),
    money("fallbackTargetCpaMinor"),
  ],
  pause_low_roas: [
    choice("level", LEVELS),
    number("roasMax"),
    money("minSpendMinor"),
    choice("window", LOW_ROAS_WINDOWS),
  ],
  scale_winner: [
    number("percent"),
    number("days"),
    number("breakEvenMultiplier"),
    number("fallbackMinRoas"),
    money("minSpendMinor"),
    number("minHoursBetween"),
  ],
  duplicate_winner: [
    number("minRoas"),
    money("minSpendMinor"),
    choice("range", DUPLICATE_RANGES),
  ],
};
