import { cx } from "../../components/classes";
import { useThrottledValue } from "../../lib/use-throttled-value";
import type { LaunchProgress } from "../../../shared/schemas/launch";
import { barSegments, summaryText, type BarSegment } from "./progress-model";

export const ANNOUNCE_INTERVAL_MS = 5000;

const SEGMENT_CLASS: Record<BarSegment["tone"], string> = {
  done: "bg-gain",
  running: "bg-primary",
  failed: "bg-loss",
  pending: "bg-rule-strong",
};

export function ProgressSummary({ progress }: { progress: LaunchProgress }) {
  const text = summaryText(progress);
  const announced = useThrottledValue(text, ANNOUNCE_INTERVAL_MS);

  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{text}</p>
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
      <div
        aria-hidden="true"
        className="mt-2 flex h-2 overflow-hidden rounded-xs bg-surface-sunken"
      >
        {barSegments(progress).map(({ tone, percent }) => (
          <div
            key={tone}
            className={cx(
              "h-full transition-[width] duration-200",
              SEGMENT_CLASS[tone],
            )}
            style={{ width: `${percent}%` }}
          />
        ))}
      </div>
    </div>
  );
}
