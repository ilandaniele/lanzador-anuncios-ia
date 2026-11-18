import { useState } from "react";
import { useNavigate } from "react-router";
import type { LaunchDto, LaunchProgress } from "../../../shared/schemas/launch";
import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { ActivateDialog } from "./ActivateDialog";
import { checksAreGreen, failedChecks, plannedStart } from "./progress-model";

type ProgressDecisionProps = {
  workspaceId: string;
  launch: LaunchDto;
  progress: LaunchProgress;
};

type DialogMode = "now" | "schedule";

function PendingChecks({ progress }: { progress: LaunchProgress }) {
  const pending = failedChecks(progress);
  return (
    <div>
      <p className="font-medium">{t("launchProgress.pendingChecks")}</p>
      {pending.length > 0 && (
        <ul className="list-disc pl-5 text-loss">
          {pending.map(({ code, text }) => (
            <li key={code}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProgressDecision({
  workspaceId,
  launch,
  progress,
}: ProgressDecisionProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<DialogMode | null>(null);
  const alreadyScheduled = plannedStart(launch.startAt) !== undefined;

  return (
    <section
      aria-labelledby="progress-decision-title"
      className="flex flex-col gap-3"
    >
      <h2 id="progress-decision-title" className="font-semibold">
        {t("launchProgress.decisionTitle")}
      </h2>
      {checksAreGreen(progress) ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("now")}>
            {alreadyScheduled
              ? t("launchProgress.activate")
              : t("launchProgress.activateNow")}
          </Button>
          {!alreadyScheduled && (
            <Button variant="secondary" onClick={() => setMode("schedule")}>
              {t("launchProgress.schedule")}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => navigate(workspacePath(workspaceId, "historial"))}
          >
            {t("launchProgress.keepPaused")}
          </Button>
        </div>
      ) : (
        <PendingChecks progress={progress} />
      )}
      {mode && (
        <ActivateDialog
          workspaceId={workspaceId}
          launch={launch}
          adsCount={progress.counts.done}
          askStart={mode === "schedule"}
          onClose={() => setMode(null)}
        />
      )}
    </section>
  );
}
