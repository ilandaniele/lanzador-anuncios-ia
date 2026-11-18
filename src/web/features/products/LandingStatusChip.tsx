import type { LandingStatus } from "../../../shared/constants";
import { StatusChip, type StatusTone } from "../../components/Chip";
import { t } from "../../i18n/es-AR";

const TONES: Record<LandingStatus, StatusTone> = {
  unchecked: "paused",
  ok: "ready",
  soft_ok: "warn",
  error: "error",
};

export function LandingStatusChip({ status }: { status: LandingStatus }) {
  return (
    <StatusChip tone={TONES[status]}>
      {t(`products.landingStatus.${status}`)}
    </StatusChip>
  );
}
