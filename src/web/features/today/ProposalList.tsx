import { Link } from "react-router";
import {
  PENDING_COUNT_CAP,
  type TodayResponse,
} from "../../../shared/schemas/today";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";

type ProposalListProps = {
  workspaceId: string;
  proposals: TodayResponse["proposals"];
  className?: string;
};

const countLabel = (pendingCount: number) =>
  pendingCount >= PENDING_COUNT_CAP
    ? `${PENDING_COUNT_CAP - 1}+`
    : pendingCount;

export function ProposalList({
  workspaceId,
  proposals,
  className,
}: ProposalListProps) {
  return (
    <section aria-labelledby="hoy-proposals-title" className={className}>
      <h2 id="hoy-proposals-title" className="mb-2 font-semibold">
        {t("hoy.proposalsTitle")} ({countLabel(proposals.pendingCount)})
      </h2>
      {proposals.top.length === 0 ? (
        <p className="text-ink-muted">{t("hoy.proposalsEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {proposals.top.map((proposal) => (
            <li
              key={proposal.id}
              className="rounded-md border border-rule bg-surface p-4"
            >
              <p className="font-medium">
                {t(`hoy.proposalAction.${proposal.action}`)}{" "}
                {proposal.objectName}
              </p>
              {proposal.explanation && (
                <p className="text-sm text-ink-muted">{proposal.explanation}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link
        to={workspacePath(workspaceId, "piloto")}
        className="mt-2 inline-block text-primary underline"
      >
        {t("hoy.proposalsMore")}
      </Link>
    </section>
  );
}
