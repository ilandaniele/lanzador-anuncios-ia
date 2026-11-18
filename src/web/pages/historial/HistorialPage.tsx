import { useState } from "react";
import { useParams } from "react-router";
import { Tabs } from "../../components/Tabs";
import { ToastProvider } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { AuditTab } from "./AuditTab";
import { LaunchesTab } from "./LaunchesTab";

type TabId = "launches" | "audit";

const TABS: { id: TabId; label: string }[] = [
  { id: "launches", label: t("history.tabLaunches") },
  { id: "audit", label: t("history.tabAudit") },
];

export default function HistorialPage() {
  const { workspaceId = "" } = useParams();
  const [tab, setTab] = useState<TabId>("launches");

  return (
    <ToastProvider>
      <section aria-labelledby="historial-titulo">
        <h1 id="historial-titulo" className="mb-4 text-xl font-semibold">
          {t("history.title")}
        </h1>
        <Tabs
          label={t("history.tabsLabel")}
          tabs={TABS}
          selected={tab}
          onSelect={setTab}
        >
          {tab === "launches" ? (
            <LaunchesTab workspaceId={workspaceId} />
          ) : (
            <AuditTab workspaceId={workspaceId} />
          )}
        </Tabs>
      </section>
    </ToastProvider>
  );
}
