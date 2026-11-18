import { MAX_SCALE_PERCENT, PILOT_RULE_TYPES } from "../../../shared/constants";
import { pilotRuleSchema, type PilotRule } from "../../../shared/schemas/pilot";
import { t } from "../../i18n/es-AR";
import { formatMinorForInput, parseMoneyToMinor } from "../../lib/money";
import { RULE_FIELDS, type FieldSpec, type RuleType } from "./rule-fields";

export type RuleDraft = {
  ruleType: RuleType;
  enabled: boolean;
  fields: Record<string, string>;
};

export type FieldErrors = Record<string, string>;

export type RuleCheck = { rule: PilotRule | null; errors: FieldErrors };

const DECIMAL_COMMA = ",";

const toText = (spec: FieldSpec, value: unknown) => {
  if (spec.kind === "money") return formatMinorForInput(value as number);
  const text = String(value);
  return spec.kind === "number" ? text.replace(".", DECIMAL_COMMA) : text;
};

const parseText = (spec: FieldSpec, text: string) => {
  if (spec.kind === "choice") return text;
  if (spec.kind === "money") return parseMoneyToMinor(text);
  return text.trim() === "" ? null : Number(text.replace(DECIMAL_COMMA, "."));
};

const toRuleDraft = ({ ruleType, enabled, params }: PilotRule): RuleDraft => ({
  ruleType,
  enabled,
  fields: Object.fromEntries(
    RULE_FIELDS[ruleType].map((spec) => [
      spec.key,
      toText(spec, (params as Record<string, unknown>)[spec.key]),
    ]),
  ),
});

const typeOrder = ({ ruleType }: PilotRule) =>
  PILOT_RULE_TYPES.indexOf(ruleType);

export const toRuleDrafts = (rules: PilotRule[]): RuleDraft[] =>
  [...rules].sort((a, b) => typeOrder(a) - typeOrder(b)).map(toRuleDraft);

export const isRuleChanged = (
  initial: RuleDraft | undefined,
  draft: RuleDraft,
) => JSON.stringify(initial) !== JSON.stringify(draft);

export function checkRule({ ruleType, enabled, fields }: RuleDraft): RuleCheck {
  const params = Object.fromEntries(
    RULE_FIELDS[ruleType].map((spec) => [
      spec.key,
      parseText(spec, fields[spec.key] ?? ""),
    ]),
  );
  const parsed = pilotRuleSchema.safeParse({ ruleType, enabled, params });
  const errors: FieldErrors = parsed.success
    ? {}
    : Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[1]),
          t("pilot.rules.invalidValue"),
        ]),
      );
  if (ruleType === "scale_winner" && Number(params.percent) > MAX_SCALE_PERCENT)
    errors.percent = t("pilot.rules.percentMax");
  const valid = parsed.success && Object.keys(errors).length === 0;
  return { rule: valid ? parsed.data : null, errors };
}
