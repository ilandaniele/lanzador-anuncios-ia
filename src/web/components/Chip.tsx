import type { ReactNode } from "react";
import { t } from "../i18n/es-AR";
import { cx, focusRing } from "./classes";

const chipBase =
  "inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-sm";

type ToggleChipProps = {
  pressed: boolean;
  onToggle: (pressed: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
};

export function ToggleChip({
  pressed,
  onToggle,
  disabled,
  children,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onToggle(!pressed)}
      className={cx(
        chipBase,
        "disabled:text-ink-subtle",
        pressed
          ? "border-primary bg-primary-soft text-ink"
          : "border-rule-strong bg-surface text-ink",
        focusRing,
      )}
    >
      {pressed && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  );
}

type RemovableChipProps = {
  label: string;
  onRemove: () => void;
};

export function RemovableChip({ label, onRemove }: RemovableChipProps) {
  return (
    <span className={cx(chipBase, "border-rule-strong bg-surface text-ink")}>
      {label}
      <button
        type="button"
        aria-label={`${t("chip.remove")} ${label}`}
        onClick={onRemove}
        className={cx("rounded-xs px-1 hover:bg-paper", focusRing)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}

export type StatusTone =
  "ready" | "error" | "warn" | "progress" | "paused" | "draft";

const statusStyle: Record<StatusTone, { icon: string; className: string }> = {
  ready: { icon: "✓", className: "border-gain bg-gain-soft text-gain" },
  error: { icon: "✕", className: "border-loss bg-loss-soft text-loss" },
  warn: { icon: "!", className: "border-warn bg-warn-soft text-warn" },
  progress: {
    icon: "●",
    className: "border-primary bg-primary-soft text-primary",
  },
  paused: { icon: "❚❚", className: "border-rule-strong text-ink-muted" },
  draft: { icon: "✎", className: "border-dashed border-pencil text-pencil" },
};

type StatusChipProps = {
  tone: StatusTone;
  children: ReactNode;
};

export function StatusChip({ tone, children }: StatusChipProps) {
  const { icon, className } = statusStyle[tone];
  return (
    <span className={cx(chipBase, className)}>
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}
