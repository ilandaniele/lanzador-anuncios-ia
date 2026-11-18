import { Link } from "react-router";
import {
  PENDING_COUNT_CAP,
  type TodayResponse,
} from "../../../shared/schemas/today";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { ProposalCardList } from "../pilot/ProposalCardList";

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
        <ProposalCardList workspaceId={workspaceId} proposals={proposals.top} />
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
