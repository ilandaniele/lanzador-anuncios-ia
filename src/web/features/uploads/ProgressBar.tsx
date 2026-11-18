type ProgressBarProps = {
  label: string;
  percent: number;
  tone?: "primary" | "warn";
};

const FILL_CLASS = { primary: "bg-primary", warn: "bg-warn" };

export function ProgressBar({
  label,
  percent,
  tone = "primary",
}: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-tone={tone}
      className="h-1 overflow-hidden rounded-xs bg-surface-sunken"
    >
      <div
        className={`h-full ${FILL_CLASS[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
