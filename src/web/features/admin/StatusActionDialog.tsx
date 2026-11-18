import type { WorkspaceStatus } from "../../../shared/constants";
import type {
  AdminWorkspaceDto,
  PatchAdminWorkspace,
} from "../../../shared/schemas/admin";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { t, type TextKey } from "../../i18n/es-AR";
import { restoreErrorMessage } from "./admin-errors";
import { usePatchAdminWorkspace } from "./use-admin";

export type StatusActionKind = "suspend" | "restore";

type Copy = {
  title: TextKey;
  confirm: TextKey;
  consequence: TextKey;
  done: TextKey;
  patch: PatchAdminWorkspace;
  statusAfter: WorkspaceStatus;
  errorMessage: (error: unknown) => string;
};

const COPY: Record<StatusActionKind, Copy> = {
  suspend: {
    title: "admin.suspendTitle",
    confirm: "admin.suspend",
    consequence: "admin.suspendConsequence",
    done: "admin.suspended",
    patch: { status: "disabled" },
    statusAfter: "disabled",
    errorMessage: () => t("errors.generic"),
  },
  restore: {
    title: "admin.restoreTitle",
    confirm: "admin.restore",
    consequence: "admin.restoreConsequence",
    done: "admin.restored",
    patch: { status: "active" },
    statusAfter: "active",
    errorMessage: restoreErrorMessage,
  },
};

type StatusActionDialogProps = {
  kind: StatusActionKind;
  workspace: AdminWorkspaceDto;
  onClose: () => void;
};

export function StatusActionDialog({
  kind,
  workspace,
  onClose,
}: StatusActionDialogProps) {
  const patch = usePatchAdminWorkspace();
  const { notify } = useToast();
  const copy = COPY[kind];

  function confirm() {
    patch.mutate(
      { id: workspace.id, patch: copy.patch },
      {
        onSuccess: () => {
          notify({ tone: "success", message: t(copy.done) });
          onClose();
        },
      },
    );
  }

  return (
    <ConfirmDialog
      title={t(copy.title)}
      confirmLabel={t(copy.confirm)}
      rows={[
        { label: t("admin.receiptWorkspace"), value: workspace.name },
        { label: t("admin.receiptOwner"), value: workspace.ownerEmail },
        {
          label: t("admin.receiptStatus"),
          value: `${t(`admin.status.${workspace.status}`)} → ${t(`admin.status.${copy.statusAfter}`)}`,
        },
      ]}
      consequence={t(copy.consequence)}
      submitting={patch.isPending}
      errorMessage={patch.error ? copy.errorMessage(patch.error) : undefined}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
