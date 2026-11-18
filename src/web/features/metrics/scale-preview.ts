const STEP_MINOR = 100;

export function previewScaledBudget(
  currentMinor: number,
  percent: number,
): number {
  const rounded =
    Math.round((currentMinor * (100 + percent)) / (100 * STEP_MINOR)) *
    STEP_MINOR;
  return Math.max(currentMinor + STEP_MINOR, rounded);
}
