import { t } from "../../i18n/es-AR";
import { cx } from "../../components/classes";
import { computeDelta, type DeltaSense, type DeltaTone } from "./compute-delta";
import { formatPercent, formatPercentPlain } from "./metric-format";

const SYMBOL = { up: "▲", down: "▼", same: "=", none: "—" } as const;

const toneClass: Record<DeltaTone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-ink-muted",
  muted: "text-ink-subtle",
};

type DeltaProps = {
  sense: DeltaSense;
  current: number | null;
  previous: number | null;
};

export function Delta({ sense, current, previous }: DeltaProps) {
  const { direction, tone, percent } = computeDelta(sense, current, previous);
  const visible =
    direction === "none"
      ? SYMBOL.none
      : `${SYMBOL[direction]} ${formatPercent(percent, direction === "same" ? "never" : "exceptZero")}`;
  const verdict =
    tone === "gain"
      ? `, ${t("metrics.delta.better")}`
      : tone === "loss"
        ? `, ${t("metrics.delta.worse")}`
        : "";
  const spoken =
    direction === "up" || direction === "down"
      ? `${t(`metrics.delta.${direction}`)} ${formatPercentPlain(percent)} ${t("metrics.delta.vsPrevious")}${verdict}`
      : t(`metrics.delta.${direction}`);

  return (
    <span className={cx("block text-sm tabular-nums", toneClass[tone])}>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
