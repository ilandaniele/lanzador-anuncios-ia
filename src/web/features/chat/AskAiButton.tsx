import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { aiUsageReason } from "../ai/budget-reason";
import { useWorkspaceOverview } from "../settings/use-workspace-settings";

export function AskAiButton({
  workspaceId,
  onClick,
}: {
  workspaceId: string;
  onClick: () => void;
}) {
  const usage = useWorkspaceOverview(workspaceId).data?.aiUsage;

  return (
    <Button
      variant="secondary"
      aria-keyshortcuts="Control+K"
      disabledReason={aiUsageReason(usage) ?? undefined}
      onClick={onClick}
    >
      {t("chat.open")}
      <kbd
        aria-hidden="true"
        className="text-ink-subtle hidden text-sm xl:inline"
      >
        Ctrl K
      </kbd>
    </Button>
  );
}
