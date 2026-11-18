import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { formatRoas } from "../../lib/format-roas";
import { NO_VALUE } from "./metric-format";

const BAR_CAP_MULTIPLE = 3;
const PERCENT = 100;

type RoasValueProps = {
  roas: number | null;
  breakEvenRoas: number | null | undefined;
};

function BreakEvenBar({
  roas,
  breakEvenRoas,
}: {
  roas: number;
  breakEvenRoas: number;
}) {
  const fill = Math.min(roas / (BAR_CAP_MULTIPLE * breakEvenRoas), 1) * PERCENT;
  const above = roas >= breakEvenRoas;
  return (
    <span
      aria-hidden="true"
      className="relative ml-auto mt-1 block h-1 w-10 bg-surface-sunken"
    >
      <span
        data-testid="break-even-fill"
        className={cx(
          "absolute inset-y-0 left-0",
          above ? "bg-gain" : "bg-loss",
        )}
        style={{ width: `${fill}%` }}
      />
      <span
        className="absolute -inset-y-0.5 w-px bg-ink"
        style={{ left: `${PERCENT / BAR_CAP_MULTIPLE}%` }}
      />
    </span>
  );
}

export function RoasValue({ roas, breakEvenRoas }: RoasValueProps) {
  if (roas === null) return NO_VALUE;
  const value = formatRoas(roas);
  if (breakEvenRoas == null)
    return (
      <>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">{`${t("metrics.roasLabel")} ${value}, ${t("metrics.roasSrNone")}`}</span>
      </>
    );

  const above = roas >= breakEvenRoas;
  const spoken = `${t("metrics.roasLabel")} ${value}, ${t(above ? "metrics.roasSrAbove" : "metrics.roasSrBelow")} ${formatRoas(breakEvenRoas)}`;
  return (
    <>
      <span
        aria-hidden="true"
        className={cx("block", above ? "text-gain" : "text-loss")}
      >
        {above ? "✓" : "⚠"} {value}{" "}
        <span className="text-sm">
          {t(above ? "metrics.roasAbove" : "metrics.roasBelow")}
        </span>
      </span>
      <span className="sr-only">{spoken}</span>
      <BreakEvenBar roas={roas} breakEvenRoas={breakEvenRoas} />
    </>
  );
}
