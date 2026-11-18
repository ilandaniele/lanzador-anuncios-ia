import type { ReactNode } from "react";
import type { Settings } from "../../../shared/schemas/workspaces";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { useWorkspaceOverview } from "../settings/use-workspace-settings";

type SettingsGateProps = {
  workspaceId: string;
  failedText: string;
  children: (settings: Settings) => ReactNode;
};

export function SettingsGate({
  workspaceId,
  failedText,
  children,
}: SettingsGateProps) {
  const overview = useWorkspaceOverview(workspaceId);

  if (overview.isPending)
    return (
      <SkeletonRegion label={t("common.loading")} className="max-w-[720px]">
        <Skeleton className="h-24" />
      </SkeletonRegion>
    );
  if (overview.isError)
    return (
      <div role="alert" className="flex items-center gap-2">
        <p className="text-loss">{failedText}</p>
        <Button variant="ghost" onClick={() => void overview.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  return children(overview.data.settings);
}
