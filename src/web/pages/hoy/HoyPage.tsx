import { useParams } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { ToastProvider } from "../../components/Toast";
import { TodayBody } from "../../features/today/TodayBody";
import { TodayHeader } from "../../features/today/TodayHeader";
import { useToday } from "../../features/today/use-today";
import { t } from "../../i18n/es-AR";

function TodaySkeleton() {
  return (
    <SkeletonRegion label={t("common.loading")} className="grid gap-6">
      <Skeleton className="h-12 w-64" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-40" />
    </SkeletonRegion>
  );
}

function HoyContent({ workspaceId }: { workspaceId: string }) {
  const today = useToday(workspaceId);

  return (
    <main className="p-4">
      <TodayHeader
        workspaceId={workspaceId}
        updatedAt={today.data?.updatedAt}
        stale={today.data?.stale ?? false}
      />
      {today.isError && (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-loss">{t("hoy.loadFailed")}</p>
          <Button variant="secondary" onClick={() => void today.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {today.data ? (
        <TodayBody workspaceId={workspaceId} today={today.data} />
      ) : (
        !today.isError && <TodaySkeleton />
      )}
    </main>
  );
}

export default function HoyPage() {
  const { workspaceId = "" } = useParams();
  return (
    <ToastProvider>
      <HoyContent workspaceId={workspaceId} />
    </ToastProvider>
  );
}
