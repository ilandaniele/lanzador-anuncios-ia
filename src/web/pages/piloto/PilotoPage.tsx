import { useParams, useSearchParams } from "react-router";
import { Tabs } from "../../components/Tabs";
import { ToastProvider } from "../../components/Toast";
import { PilotHeader } from "../../features/pilot/PilotHeader";
import { usePendingProposals } from "../../features/pilot/use-proposals";
import { useWorkspaceRole } from "../../features/settings/use-workspace-role";
import { t } from "../../i18n/es-AR";
import { HISTORY_TAB_ID, PENDING_TAB_ID, visibleTabs } from "./tabs";

const TAB_PARAM = "tab";
const PROPOSAL_PARAM = "propuesta";

function PilotoContent({ workspaceId }: { workspaceId: string }) {
  const [params, setParams] = useSearchParams();
  const role = useWorkspaceRole(workspaceId);
  const pending = usePendingProposals(workspaceId);
  const tabs = visibleTabs(role);
  const highlightId = params.get(PROPOSAL_PARAM);
  const pendingIds =
    pending.data?.pages.flatMap((page) => page.data.map(({ id }) => id)) ?? [];
  const linkedIsResolved =
    highlightId !== null &&
    pending.isSuccess &&
    !pending.hasNextPage &&
    !pendingIds.includes(highlightId);
  const requestedTab =
    params.get(TAB_PARAM) ?? (linkedIsResolved ? HISTORY_TAB_ID : null);
  const activeTab = tabs.find(({ id }) => id === requestedTab) ?? tabs[0];
  const Panel = activeTab?.panel;
  const pendingCount = `${pendingIds.length}${pending.hasNextPage ? "+" : ""}`;

  const selectTab = (id: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(TAB_PARAM, id);
        return next;
      },
      { replace: true },
    );

  return (
    <section aria-labelledby="piloto-titulo">
      <PilotHeader workspaceId={workspaceId} />
      <Tabs
        label={t("pilot.tabsLabel")}
        tabs={tabs.map(({ id, label }) => ({
          id,
          label:
            id === PENDING_TAB_ID && pendingIds.length > 0
              ? `${t(label)} (${pendingCount})`
              : t(label),
        }))}
        selected={activeTab?.id ?? PENDING_TAB_ID}
        onSelect={selectTab}
      >
        {Panel && <Panel workspaceId={workspaceId} highlightId={highlightId} />}
      </Tabs>
    </section>
  );
}

export default function PilotoPage() {
  const { workspaceId = "" } = useParams();
  return (
    <ToastProvider>
      <PilotoContent workspaceId={workspaceId} />
    </ToastProvider>
  );
}
