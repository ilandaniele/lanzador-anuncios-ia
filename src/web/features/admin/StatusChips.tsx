import type {
  ConnectionStatus,
  WorkspaceStatus,
} from "../../../shared/constants";
import { StatusChip, type StatusTone } from "../../components/Chip";
import { t } from "../../i18n/es-AR";

const WORKSPACE_TONE: Record<WorkspaceStatus, StatusTone> = {
  active: "ready",
  disabled: "warn",
  deleting: "error",
};

const META_TONE: Record<ConnectionStatus, StatusTone> = {
  active: "ready",
  reconnect_required: "warn",
};

export const WorkspaceStatusChip = ({
  status,
}: {
  status: WorkspaceStatus;
}) => (
  <StatusChip tone={WORKSPACE_TONE[status]}>
    {t(`admin.status.${status}`)}
  </StatusChip>
);

export const MetaStatusChip = ({
  status,
}: {
  status: ConnectionStatus | null;
}) =>
  status === null ? (
    <StatusChip tone="paused">{t("admin.meta.none")}</StatusChip>
  ) : (
    <StatusChip tone={META_TONE[status]}>
      {t(`admin.meta.${status}`)}
    </StatusChip>
  );
