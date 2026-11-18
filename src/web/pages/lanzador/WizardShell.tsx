import { useState } from "react";
import { useSearchParams } from "react-router";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { reachableStepCount } from "../../features/launch/step-completion";
import { Stepper } from "../../features/launch/Stepper";
import { useDraftAutosave } from "../../features/launch/use-draft";
import { WizardFooter } from "../../features/launch/WizardFooter";
import { t } from "../../i18n/es-AR";
import { LiveSummary } from "./LiveSummary";
import { WIZARD_STEPS } from "./wizard-steps";

type WizardShellProps = {
  workspaceId: string;
  launchId: string;
  initialDraft: PartialLaunchDraft;
};

const STEP_PARAM = "paso";

function clampStep(requested: string | null, lastReachable: number) {
  const index = Number(requested ?? 1) - 1;
  return Number.isInteger(index)
    ? Math.min(Math.max(index, 0), lastReachable)
    : 0;
}

export function WizardShell({
  workspaceId,
  launchId,
  initialDraft,
}: WizardShellProps) {
  const { draft, update, saveState } = useDraftAutosave(
    workspaceId,
    launchId,
    initialDraft,
  );
  const [params, setParams] = useSearchParams();
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const reachable = reachableStepCount(WIZARD_STEPS, draft);
  const current = clampStep(params.get(STEP_PARAM), reachable - 1);
  const step = WIZARD_STEPS[current]!;
  const Step = step.Component;
  const isLast = current === WIZARD_STEPS.length - 1;
  const lastAllowed = blockReason ? current : reachable - 1;
  const nextBlockedReason =
    blockReason ??
    (step.isComplete(draft) ? undefined : t("launcher.nextIncomplete"));

  function goTo(index: number) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(STEP_PARAM, String(index + 1));
      return next;
    });
  }

  return (
    <main className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t("launcher.title")}</h1>
      <Stepper
        currentIndex={current}
        onSelect={goTo}
        steps={WIZARD_STEPS.map(({ label, isComplete }, index) => ({
          label,
          complete: isComplete(draft),
          reachable: index <= lastAllowed,
        }))}
      />
      <div className="mt-6 flex flex-col gap-6 xl:flex-row-reverse">
        <LiveSummary
          workspaceId={workspaceId}
          draft={draft}
          onSelectStep={(index) => goTo(Math.min(index, lastAllowed))}
        />
        <section className="min-w-0 flex-1">
          {Step ? (
            <Step
              key={current}
              workspaceId={workspaceId}
              draft={draft}
              update={update}
              setBlockReason={setBlockReason}
            />
          ) : (
            <p>{t("launcher.stepUnavailable")}</p>
          )}
        </section>
      </div>
      <WizardFooter
        saveState={saveState}
        onBack={current > 0 ? () => goTo(current - 1) : undefined}
        onNext={isLast ? undefined : () => goTo(current + 1)}
        nextBlockedReason={nextBlockedReason}
      />
    </main>
  );
}
