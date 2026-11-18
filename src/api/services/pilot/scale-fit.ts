import { MAX_SCALE_PERCENT } from "../../../shared/constants";
import { AppError } from "../../lib/errors";
import { type ScaleLimits, scaledBudget } from "../scale-budget";

export interface ScaleFit {
  percent: number;
  budgetMinor: number;
}

function tryScaledBudget(
  currentMinor: number,
  percent: number,
  limits: ScaleLimits,
): number | null {
  try {
    return scaledBudget(currentMinor, percent, limits);
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

export function fitScale(
  currentMinor: number,
  requestedPercent: number,
  limits: ScaleLimits,
): ScaleFit | null {
  const ceiling = Math.min(
    requestedPercent,
    limits.maxScalePercent,
    MAX_SCALE_PERCENT,
  );
  for (let percent = ceiling; percent >= 1; percent--) {
    const budgetMinor = tryScaledBudget(currentMinor, percent, limits);
    if (budgetMinor !== null) return { percent, budgetMinor };
  }
  return null;
}
