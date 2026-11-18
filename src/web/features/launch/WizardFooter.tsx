import { Button } from "../../components/Button";
import { t, type TextKey } from "../../i18n/es-AR";
import type { SaveState } from "./use-draft";

const SAVE_LABELS: Record<SaveState, TextKey> = {
  saved: "launcher.saved",
  saving: "launcher.saving",
  offline: "launcher.offline",
  failed: "launcher.saveFailed",
};

type WizardFooterProps = {
  saveState: SaveState;
  onBack?: () => void;
  onNext?: () => void;
  nextBlockedReason?: string;
};

export function WizardFooter({
  saveState,
  onBack,
  onNext,
  nextBlockedReason,
}: WizardFooterProps) {
  return (
    <footer className="sticky bottom-0 mt-6 flex items-center justify-between gap-4 border-t border-rule bg-paper py-3">
      <div>
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {t("launcher.back")}
          </Button>
        )}
      </div>
      <p role="status" className="text-xs text-ink-muted">
        {t(SAVE_LABELS[saveState])}
      </p>
      <div>
        {onNext && (
          <Button onClick={onNext} disabledReason={nextBlockedReason}>
            {t("launcher.next")}
          </Button>
        )}
      </div>
    </footer>
  );
}
