import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { ToastProvider } from "../../components/Toast";
import { useMe } from "../../features/auth/use-me";
import { ConnectMetaStep } from "../../features/onboarding/ConnectMetaStep";
import { OnboardingLayout } from "../../features/onboarding/OnboardingLayout";
import { WorkspaceNameStep } from "../../features/onboarding/WorkspaceNameStep";
import { AssetPicker } from "../../features/meta/AssetPicker";
import { useConnections } from "../../features/meta/use-meta-connections";
import { ProductForm } from "../../features/products/ProductForm";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";

const CONNECT_STEP = 1;
const ASSETS_STEP = 2;
const PRODUCT_STEP = 3;

function WorkspaceSteps({ workspaceId }: { workspaceId: string }) {
  const connections = useConnections(workspaceId);
  const navigate = useNavigate();
  const [assetsDone, setAssetsDone] = useState(false);
  const goToToday = () => navigate(workspacePath(workspaceId, "hoy"));

  if (connections.isPending)
    return (
      <OnboardingLayout currentIndex={CONNECT_STEP}>
        <SkeletonRegion
          label={t("common.loading")}
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-24" />
        </SkeletonRegion>
      </OnboardingLayout>
    );

  if (connections.isError)
    return (
      <OnboardingLayout currentIndex={CONNECT_STEP}>
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>{t("connections.loadError")}</p>
          <Button
            variant="secondary"
            onClick={() => void connections.refetch()}
          >
            {t("errors.retry")}
          </Button>
        </div>
      </OnboardingLayout>
    );

  if (connections.data.length === 0)
    return (
      <OnboardingLayout currentIndex={CONNECT_STEP}>
        <ConnectMetaStep workspaceId={workspaceId} />
      </OnboardingLayout>
    );

  if (!assetsDone)
    return (
      <OnboardingLayout currentIndex={ASSETS_STEP}>
        <AssetPicker workspaceId={workspaceId} />
        <div>
          <Button variant="secondary" onClick={() => setAssetsDone(true)}>
            {t("onboarding.continue")}
          </Button>
        </div>
      </OnboardingLayout>
    );

  return (
    <OnboardingLayout currentIndex={PRODUCT_STEP} wide>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {t("onboarding.productTitle")}
          </h2>
          <p className="text-ink-muted">{t("onboarding.productHint")}</p>
        </div>
        <Button variant="ghost" onClick={() => void goToToday()}>
          {t("onboarding.skip")}
        </Button>
      </div>
      <ProductForm workspaceId={workspaceId} onSaved={() => void goToToday()} />
    </OnboardingLayout>
  );
}

export default function OnboardingPage() {
  const me = useMe();
  const ownedWorkspace = me.data?.workspaces.find(
    ({ role }) => role === "owner",
  );

  return (
    <ToastProvider>
      {ownedWorkspace ? (
        <WorkspaceSteps workspaceId={ownedWorkspace.id} />
      ) : (
        <WorkspaceNameStep />
      )}
    </ToastProvider>
  );
}
