import { t } from "../../i18n/es-AR";
import { ProgressBar } from "../uploads/ProgressBar";

const WARN_PERCENT = 80;

const amount = new Intl.NumberFormat("es-AR");

type UsageMeterProps = {
  used: number;
  cap: number;
  suffix: string;
};

export function UsageMeter({ used, cap, suffix }: UsageMeterProps) {
  const exactPercent = cap > 0 ? (used / cap) * 100 : 100;
  const percent = Math.min(100, Math.round(exactPercent));
  const label = `${amount.format(used)} ${t("aiSettings.of")} ${amount.format(cap)} ${suffix}`;

  return (
    <div className="flex flex-col gap-1">
      <p>{label}</p>
      <ProgressBar
        label={label}
        percent={percent}
        tone={exactPercent >= WARN_PERCENT ? "warn" : "primary"}
      />
    </div>
  );
}
