import { Link } from "react-router";
import type { TodayResponse } from "../../../shared/schemas/today";
import { buttonClass } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { AccountCards } from "./AccountCards";
import { AlertStrips } from "./AlertStrips";
import { LatestLaunches } from "./LatestLaunches";
import { ProposalList } from "./ProposalList";
import { TodayTotal } from "./TodayTotal";

type TodayBodyProps = { workspaceId: string; today: TodayResponse };

export function TodayBody({ workspaceId, today }: TodayBodyProps) {
  const { accounts, alerts, proposals, launches } = today;
  const hasPending = proposals.pendingCount > 0;
  const isEmpty = accounts.length === 0 && launches.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AlertStrips workspaceId={workspaceId} alerts={alerts} />
      {isEmpty ? (
        <div className="lg:col-span-2">
          <EmptyState
            message={t("hoy.emptyBody")}
            action={
              <Link
                to={workspacePath(workspaceId, "lanzador")}
                className={buttonClass()}
              >
                {t("hoy.newLaunch")}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <TodayTotal accounts={accounts} />
          <ProposalList
            workspaceId={workspaceId}
            proposals={proposals}
            className={hasPending ? "order-3 lg:order-4" : "order-5 lg:order-4"}
          />
          <AccountCards
            accounts={accounts}
            className="order-4 lg:order-3 lg:col-span-2"
          />
          <LatestLaunches
            workspaceId={workspaceId}
            launches={launches}
            className="order-5"
          />
        </>
      )}
    </div>
  );
}
