import { Spinner } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { t, type TextKey } from "../../i18n/es-AR";
import type { CreativeState } from "./creative-state";

const STATE_TEXT = {
  ready: "uploads.ready",
  processing: "uploads.processing",
  unavailable: "launcher.step4.unavailable",
} as const satisfies Record<CreativeState, TextKey>;

export function CreativeStatusChip({ state }: { state: CreativeState }) {
  if (state === "processing")
    return (
      <span className="flex items-center gap-2 text-ink-muted">
        <Spinner />
        {t(STATE_TEXT[state])}
      </span>
    );
  return (
    <StatusChip tone={state === "ready" ? "ready" : "error"}>
      {t(STATE_TEXT[state])}
    </StatusChip>
  );
}
