import { describe, expect, it } from "vitest";
import { AppError } from "../../src/api/lib/errors";
import {
  type ScaleLimits,
  scaledBudget,
} from "../../src/api/services/scale-budget";

const limits: ScaleLimits = {
  maxScalePercent: 50,
  maxCampaignBudgetMinor: 30000,
};

function errorCode(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error("expected an AppError");
}

describe("scaledBudget", () => {
  it.each([
    [5000, 20, 6000],
    [5000, 10, 5500],
    [1234, 10, 1400],
    [1250, 10, 1400],
    [1000, 50, 1500],
  ])("scales %i by %i%% to %i rounded to whole units", (current, pct, next) => {
    expect(scaledBudget(current, pct, limits)).toBe(next);
  });

  it("raises at least one unit when rounding would not move it", () => {
    expect(scaledBudget(1000, 1, limits)).toBe(1100);
  });

  it("allows reaching the workspace cap exactly", () => {
    expect(scaledBudget(25000, 20, limits)).toBe(30000);
  });

  it("rejects more than 50% even if settings allow more", () => {
    expect(
      errorCode(() =>
        scaledBudget(5000, 51, { ...limits, maxScalePercent: 80 }),
      ),
    ).toBe("SCALE_LIMIT");
  });

  it("rejects a percent above the workspace max_scale_percent", () => {
    expect(
      errorCode(() =>
        scaledBudget(5000, 40, { ...limits, maxScalePercent: 30 }),
      ),
    ).toBe("SCALE_LIMIT");
  });

  it("rejects when the one-unit minimum exceeds 1.5x the current budget", () => {
    expect(errorCode(() => scaledBudget(150, 50, limits))).toBe("SCALE_LIMIT");
  });

  it("rejects a result above the workspace budget cap", () => {
    expect(errorCode(() => scaledBudget(25000, 30, limits))).toBe("BUDGET_CAP");
  });
});
