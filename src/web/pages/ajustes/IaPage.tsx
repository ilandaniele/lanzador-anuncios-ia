import { useParams } from "react-router";
import type { AiUsage } from "../../../shared/schemas/workspaces";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { aiUsageReason } from "../../features/ai/budget-reason";
import { UsageMeter } from "../../features/settings/UsageMeter";
import { useWorkspaceOverview } from "../../features/settings/use-workspace-settings";
import { t } from "../../i18n/es-AR";

function Usage({ usage }: { usage: AiUsage }) {
  const pauseReason = aiUsageReason(usage);

  return (
    <div className="flex flex-col gap-4">
      {pauseReason && (
        <p
          role="status"
          className="rounded-sm bg-warn-soft px-3 py-2 text-warn"
        >
          {pauseReason}
        </p>
      )}
      <UsageMeter
        used={usage.neuronsToday}
        cap={usage.dailyCap}
        suffix={t("aiSettings.today")}
      />
      <UsageMeter
        used={usage.neuronsMonth}
        cap={usage.monthlyCap}
        suffix={t("aiSettings.month")}
      />
    </div>
  );
}

export default function IaPage() {
  const { workspaceId = "" } = useParams();
  const overview = useWorkspaceOverview(workspaceId);

  return (
    <section aria-labelledby="ia-titulo">
      <h2 id="ia-titulo" className="mb-4 text-xl font-semibold">
        {t("settings.ai")}
      </h2>
      {overview.isPending && (
        <SkeletonRegion
          label={t("common.loading")}
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </SkeletonRegion>
      )}
      {overview.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>{t("aiSettings.loadError")}</p>
          <Button variant="secondary" onClick={() => void overview.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {overview.data && <Usage usage={overview.data.aiUsage} />}
    </section>
  );
}
