import { useNavigate } from "react-router";
import type { WorkspaceDto } from "../../../shared/schemas/workspaces";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { t } from "../../i18n/es-AR";
import { deleteWorkspaceErrorMessage } from "./settings-errors";
import { useDeleteWorkspace } from "./use-workspace-settings";

type DeleteWorkspaceDialogProps = {
  workspace: Pick<WorkspaceDto, "id" | "name">;
  onClose: () => void;
};

export function DeleteWorkspaceDialog({
  workspace,
  onClose,
}: DeleteWorkspaceDialogProps) {
  const deletion = useDeleteWorkspace(workspace.id);
  const navigate = useNavigate();

  return (
    <ConfirmDialog
      title={t("danger.delete")}
      confirmLabel={t("danger.delete")}
      rows={[{ label: t("danger.receiptWorkspace"), value: workspace.name }]}
      consequence={t("danger.description")}
      requireText={workspace.name}
      submitting={deletion.isPending}
      errorMessage={
        deletion.error ? deleteWorkspaceErrorMessage(deletion.error) : undefined
      }
      onConfirm={() =>
        deletion.mutate(workspace.name, {
          onSuccess: () => void navigate("/", { replace: true }),
        })
      }
      onCancel={onClose}
    />
  );
}
