export type DeltaSense = "neutral" | "higherIsBetter" | "lowerIsBetter";
export type DeltaDirection = "up" | "down" | "same" | "none";
export type DeltaTone = "gain" | "loss" | "neutral" | "muted";

export interface DeltaView {
  direction: DeltaDirection;
  tone: DeltaTone;
  percent: number;
}

const SAME_BELOW_PERCENT = 0.5;
const PERCENT = 100;

const NO_DELTA: DeltaView = { direction: "none", tone: "muted", percent: 0 };

function toneOf(sense: DeltaSense, direction: "up" | "down"): DeltaTone {
  if (sense === "neutral") return "neutral";
  const improved = (direction === "up") === (sense === "higherIsBetter");
  return improved ? "gain" : "loss";
}

export function computeDelta(
  sense: DeltaSense,
  current: number | null,
  previous: number | null,
): DeltaView {
  if (current === null || !previous) return NO_DELTA;
  const percent = ((current - previous) / Math.abs(previous)) * PERCENT;
  if (Math.abs(percent) < SAME_BELOW_PERCENT)
    return { direction: "same", tone: "muted", percent };
  const direction = percent > 0 ? "up" : "down";
  return { direction, tone: toneOf(sense, direction), percent };
}
