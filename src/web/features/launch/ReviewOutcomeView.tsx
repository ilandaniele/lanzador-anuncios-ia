import { Link } from "react-router";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { blockersFromPlan } from "./blocker-steps";
import { BlockerList } from "./BlockerList";
import { planCountsText } from "./plan-counts";
import type { ReviewOutcome } from "./review-outcome";

type ReviewOutcomeViewProps = {
  workspaceId: string;
  outcome: ReviewOutcome;
};

export function ReviewOutcomeView({
  workspaceId,
  outcome,
}: ReviewOutcomeViewProps) {
  if (outcome.kind === "blockers")
    return <BlockerList blockers={outcome.blockers} />;
  if (outcome.kind === "message")
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-sm bg-loss-soft p-3 text-loss"
      >
        <p>{outcome.text}</p>
        {outcome.reconnect && (
          <Link
            to={workspacePath(workspaceId, "ajustes/conexiones")}
            className={cx("underline", focusRing)}
          >
            {t("launcher.review.reconnectLink")}
          </Link>
        )}
      </div>
    );

  const { plan } = outcome;
  return (
    <div className="flex flex-col gap-3">
      {plan.blockers.length > 0 ? (
        <BlockerList blockers={blockersFromPlan(plan.blockers)} />
      ) : (
        <p role="status" className="font-medium text-gain">
          {`${t("launcher.review.planValid")} ${planCountsText(plan)}`}
        </p>
      )}
      {plan.warnings.length > 0 && (
        <section className="rounded-sm border border-warn bg-warn-soft p-3">
          <h3 className="font-semibold text-warn">
            {t("launcher.review.warningsTitle")}
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.warnings.map(({ code, text }, index) => (
              <li key={`${code}-${index}`}>{text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
