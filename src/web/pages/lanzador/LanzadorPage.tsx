import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import type { LaunchStatus } from "../../../shared/schemas/launch";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { useMe } from "../../features/auth/use-me";
import { useCreateDraft, useLaunch } from "../../features/launch/use-draft";
import { useCanEdit } from "../../features/products/use-can-edit";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { ProgressView } from "./ProgressView";
import { WizardShell } from "./WizardShell";

const EDITABLE_STATUSES: readonly LaunchStatus[] = ["draft", "simulated"];

function Loading({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="p-4">
      <Skeleton className="h-10 w-full" />
    </SkeletonRegion>
  );
}

function Failure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex items-center gap-3 p-4">
      <p className="text-loss">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}

function NewDraft({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const { mutate, isError } = useCreateDraft(workspaceId);
  const started = useRef(false);

  const create = () =>
    mutate(undefined, {
      onSuccess: ({ id }) =>
        navigate(workspacePath(workspaceId, `lanzador/${id}?paso=1`), {
          replace: true,
        }),
    });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isError)
    return <Failure message={t("launcher.createFailed")} onRetry={create} />;
  return <Loading label={t("launcher.creating")} />;
}

function OpenDraft({
  workspaceId,
  launchId,
}: {
  workspaceId: string;
  launchId: string;
}) {
  const launch = useLaunch(workspaceId, launchId);
  if (launch.isError)
    return (
      <Failure
        message={t("launcher.loadFailed")}
        onRetry={() => void launch.refetch()}
      />
    );
  if (!launch.data) return <Loading label={t("common.loading")} />;
  if (!EDITABLE_STATUSES.includes(launch.data.launch.status))
    return <ProgressView workspaceId={workspaceId} launchId={launchId} />;
  return (
    <WizardShell
      key={launchId}
      workspaceId={workspaceId}
      launchId={launchId}
      initialDraft={launch.data.launch.draft}
    />
  );
}

export default function LanzadorPage() {
  const { workspaceId = "", launchId } = useParams();
  const canEdit = useCanEdit(workspaceId);
  const meLoading = useMe().isPending;

  if (meLoading) return <Loading label={t("common.loading")} />;
  if (!canEdit)
    return (
      <main className="p-4">
        <p role="alert">{t("launcher.readOnly")}</p>
      </main>
    );
  return launchId ? (
    <OpenDraft workspaceId={workspaceId} launchId={launchId} />
  ) : (
    <NewDraft workspaceId={workspaceId} />
  );
}
