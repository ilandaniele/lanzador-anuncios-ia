import { cx } from "../../components/classes";
import { formatRoas } from "../../lib/format-roas";
import { NO_VALUE } from "./metric-format";
import { roasDescription } from "./RoasValue";

const PERCENT = 100;

type RoasBarProps = {
  roas: number | null;
  scaleMax: number;
  breakEvenRoas: number | null | undefined;
};

export function RoasBar({ roas, scaleMax, breakEvenRoas }: RoasBarProps) {
  if (roas === null) return NO_VALUE;
  const scale = Math.max(scaleMax, breakEvenRoas ?? 0);
  const fillColor =
    breakEvenRoas == null
      ? "bg-ink-muted"
      : roas >= breakEvenRoas
        ? "bg-gain"
        : "bg-loss";

  return (
    <span className="flex items-center justify-end gap-3">
      <span aria-hidden="true" className="tabular-nums">
        {formatRoas(roas)}
      </span>
      <span
        aria-hidden="true"
        className="relative h-2 w-32 bg-surface-sunken md:w-48"
      >
        <span
          data-testid="roas-bar-fill"
          className={cx("absolute inset-y-0 left-0", fillColor)}
          style={{ width: `${(roas / scale) * PERCENT}%` }}
        />
        {breakEvenRoas != null && (
          <span
            data-testid="break-even-line"
            className="absolute -inset-y-1 w-px bg-ink"
            style={{ left: `${(breakEvenRoas / scale) * PERCENT}%` }}
          />
        )}
      </span>
      <span className="sr-only">{roasDescription(roas, breakEvenRoas)}</span>
    </span>
  );
}
