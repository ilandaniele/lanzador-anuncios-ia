import type { ComponentType } from "react";
import { ROLE_RANK, type Role } from "../../../shared/constants";
import type { TextKey } from "../../i18n/es-AR";
import HistoryTab from "./HistoryTab";
import PendingTab from "./PendingTab";

export type PilotTabProps = {
  workspaceId: string;
  highlightId: string | null;
};

export type PilotTab = {
  id: string;
  label: TextKey;
  minRole: Role;
  panel: ComponentType<PilotTabProps>;
};

export const PENDING_TAB_ID = "pendientes";
export const HISTORY_TAB_ID = "historial";

export const PILOT_TABS: [PilotTab, ...PilotTab[]] = [
  {
    id: PENDING_TAB_ID,
    label: "pilot.tabs.pending",
    minRole: "viewer",
    panel: PendingTab,
  },
  {
    id: HISTORY_TAB_ID,
    label: "pilot.tabs.history",
    minRole: "viewer",
    panel: HistoryTab,
  },
];

export const visibleTabs = (role: Role | undefined) =>
  PILOT_TABS.filter(({ minRole }) =>
    role === undefined
      ? minRole === "viewer"
      : ROLE_RANK[role] >= ROLE_RANK[minRole],
  );
