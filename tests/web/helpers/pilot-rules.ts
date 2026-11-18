import type { PilotRule } from "../../../src/shared/schemas/pilot";

export const defaultRules = (): PilotRule[] => [
  {
    ruleType: "duplicate_winner",
    enabled: false,
    params: { minRoas: 2, minSpendMinor: 3000, range: "last_7d" },
  },
  {
    ruleType: "pause_low_roas",
    enabled: false,
    params: {
      level: "campaign",
      roasMax: 1,
      minSpendMinor: 3000,
      window: "daily:last_3d",
    },
  },
  {
    ruleType: "pause_no_sales",
    enabled: true,
    params: {
      level: "ad",
      targetCpaSource: "product_margin",
      fallbackTargetCpaMinor: 1500,
      spendMultiplier: 2,
      window: "today",
    },
  },
  {
    ruleType: "scale_winner",
    enabled: false,
    params: {
      breakEvenMultiplier: 1.3,
      fallbackMinRoas: 2.5,
      days: 3,
      minSpendMinor: 1500,
      percent: 30,
      minHoursBetween: 24,
    },
  },
];
