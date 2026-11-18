import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { RulesEditor } from "../../features/pilot/RulesEditor";
import { usePilotRules } from "../../features/pilot/use-pilot-rules";
import { t } from "../../i18n/es-AR";
import type { PilotTabProps } from "./tabs";

export default function RulesTab({ workspaceId }: PilotTabProps) {
  const rules = usePilotRules(workspaceId);

  if (rules.isPending)
    return (
      <SkeletonRegion label={t("pilot.rules.loading")} className="grid gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </SkeletonRegion>
    );

  if (rules.isError)
    return (
      <div role="alert" className="flex items-center gap-3">
        <p className="text-loss">{t("pilot.rules.loadError")}</p>
        <Button variant="secondary" onClick={() => void rules.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  return (
    <>
      <h2 className="sr-only">{t("pilot.tabs.rules")}</h2>
      <RulesEditor workspaceId={workspaceId} rules={rules.data.data} />
    </>
  );
}
