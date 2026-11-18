import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Settings } from "../../../shared/schemas/workspaces";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AdPreviewList } from "../../features/launch/AdPreviewList";
import {
  outcomeFromError,
  type ReviewOutcome,
} from "../../features/launch/review-outcome";
import { ReviewOutcomeView } from "../../features/launch/ReviewOutcomeView";
import { ReviewReceipt } from "../../features/launch/ReviewReceipt";
import { reviewNames, reviewRows } from "../../features/launch/review-rows";
import { SettingsGate } from "../../features/launch/SettingsGate";
import type { StepProps } from "../../features/launch/step-types";
import { useLaunch } from "../../features/launch/use-draft";
import {
  useSimulateLaunch,
  useStartLaunch,
} from "../../features/launch/use-launch-review";
import { useMetaAssets } from "../../features/launch/use-meta-assets";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { formatMoney } from "../../lib/money";

type ReviewFormProps = Pick<StepProps, "workspaceId" | "draft"> & {
  settings: Settings;
};

function ReviewForm({ workspaceId, draft, settings }: ReviewFormProps) {
  const { launchId = "" } = useParams();
  const navigate = useNavigate();
  const launch = useLaunch(workspaceId, launchId);
  const assets = useMetaAssets(workspaceId);
  const simulate = useSimulateLaunch(workspaceId, launchId);
  const start = useStartLaunch(workspaceId, launchId);
  const [override, setOverride] = useState<ReviewOutcome | null>(null);
  const [confirming, setConfirming] = useState(false);

  const saved = launch.data;
  const outcome: ReviewOutcome | null =
    override ??
    (saved?.launch.status === "simulated" && saved.plan
      ? { kind: "plan", plan: saved.plan }
      : null);
  const plan = outcome?.kind === "plan" ? outcome.plan : undefined;
  const names = reviewNames(assets.data ?? [], draft);
  const rows = reviewRows({ draft, settings, names, plan });
  const launchBlock = !plan
    ? t("launcher.review.needsSimulation")
    : plan.blockers.length > 0
      ? t("launcher.review.launchBlocked")
      : undefined;

  function runSimulation() {
    simulate.mutate(undefined, {
      onSuccess: (result) => setOverride({ kind: "plan", plan: result }),
      onError: (error) =>
        setOverride(
          outcomeFromError(error) ?? {
            kind: "message",
            text: t("launcher.review.simulateFailed"),
          },
        ),
    });
  }

  function openConfirmation() {
    start.reset();
    setConfirming(true);
  }

  function confirmLaunch() {
    if (!plan) return;
    start.mutate(plan.planHash, {
      onSuccess: () =>
        navigate(workspacePath(workspaceId, `lanzador/${launchId}`)),
      onError: (error) => {
        const failure = outcomeFromError(error);
        if (!failure) return;
        setOverride(failure);
        setConfirming(false);
      },
    });
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <ReviewReceipt rows={rows} />
      <AdPreviewList
        workspaceId={workspaceId}
        draft={draft}
        plan={plan}
        pageName={names.page}
      />
      {outcome && (
        <ReviewOutcomeView workspaceId={workspaceId} outcome={outcome} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={simulate.isPending}
          loadingLabel={t("launcher.review.simulating")}
          onClick={runSimulation}
        >
          {t("launcher.review.simulate")}
        </Button>
        <Button disabledReason={launchBlock} onClick={openConfirmation}>
          {t("launcher.review.launch")}
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t("launcher.review.confirmTitle")}
          confirmLabel={t("launcher.review.launch")}
          submittingLabel={t("launcher.review.launching")}
          amount={
            draft.mode === "new_cbo" && draft.dailyBudgetMinor !== undefined
              ? formatMoney(draft.dailyBudgetMinor, settings.budgetCurrency)
              : undefined
          }
          rows={[
            ...rows,
            {
              label: t("launcher.review.rowStatus"),
              value: t("launcher.review.statusPaused"),
            },
          ]}
          consequence={t("launcher.review.confirmConsequence")}
          submitting={start.isPending}
          errorMessage={
            start.isError ? t("launcher.review.launchFailed") : undefined
          }
          onConfirm={confirmLaunch}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function Step6Review({ workspaceId, draft }: StepProps) {
  return (
    <SettingsGate
      workspaceId={workspaceId}
      failedText={t("launcher.review.settingsFailed")}
    >
      {(settings) => (
        <ReviewForm
          workspaceId={workspaceId}
          draft={draft}
          settings={settings}
        />
      )}
    </SettingsGate>
  );
}
