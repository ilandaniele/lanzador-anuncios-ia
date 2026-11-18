import { useParams } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { ToastProvider } from "../../components/Toast";
import { GeneralForm } from "../../features/settings/GeneralForm";
import { toDraft } from "../../features/settings/general-draft";
import { useWorkspaceOverview } from "../../features/settings/use-workspace-settings";
import { t } from "../../i18n/es-AR";

function General({ workspaceId }: { workspaceId: string }) {
  const overview = useWorkspaceOverview(workspaceId);
  const initial = overview.data && toDraft(overview.data);

  return (
    <section aria-labelledby="general-titulo">
      <h2 id="general-titulo" className="mb-4 text-xl font-semibold">
        {t("settings.general")}
      </h2>
      {overview.isPending && (
        <SkeletonRegion
          label={t("common.loading")}
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </SkeletonRegion>
      )}
      {overview.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>{t("workspaceSettings.loadError")}</p>
          <Button variant="secondary" onClick={() => void overview.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {initial && (
        <GeneralForm
          key={JSON.stringify(initial)}
          workspaceId={workspaceId}
          initial={initial}
        />
      )}
    </section>
  );
}

export default function GeneralPage() {
  const { workspaceId = "" } = useParams();
  return (
    <ToastProvider>
      <General workspaceId={workspaceId} />
    </ToastProvider>
  );
}
