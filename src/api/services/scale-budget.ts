import { MAX_SCALE_PERCENT } from "../../shared/constants";
import { unprocessable } from "../lib/errors";

const STEP_MINOR = 100;
const MAX_GROWTH_FACTOR = 1.5;

export interface ScaleLimits {
  maxScalePercent: number;
  maxCampaignBudgetMinor: number;
}

export function scaledBudget(
  currentMinor: number,
  percent: number,
  { maxScalePercent, maxCampaignBudgetMinor }: ScaleLimits,
): number {
  if (percent > Math.min(maxScalePercent, MAX_SCALE_PERCENT)) {
    throw unprocessable("SCALE_LIMIT");
  }
  const rounded =
    Math.round((currentMinor * (100 + percent)) / (100 * STEP_MINOR)) *
    STEP_MINOR;
  const next = Math.max(currentMinor + STEP_MINOR, rounded);
  if (next > currentMinor * MAX_GROWTH_FACTOR) {
    throw unprocessable("SCALE_LIMIT");
  }
  if (next > maxCampaignBudgetMinor) throw unprocessable("BUDGET_CAP");
  return next;
}
