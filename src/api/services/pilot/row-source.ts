import type { PilotRule } from "../../../shared/schemas/pilot";
import type { RuleRowSource } from "./types";

export function ruleRowSource(rule: PilotRule): RuleRowSource {
  switch (rule.ruleType) {
    case "pause_no_sales":
    case "pause_low_roas":
      return { range: rule.params.window, level: rule.params.level };
    case "scale_winner":
      return { range: `daily:last_${rule.params.days}d`, level: "campaign" };
    case "duplicate_winner":
      return { range: rule.params.range, level: "ad" };
  }
}

export const rowSourceKey = ({ range, level }: RuleRowSource) =>
  `${range}:${level}`;
