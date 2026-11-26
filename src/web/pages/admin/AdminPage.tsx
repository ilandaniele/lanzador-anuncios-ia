import { useState } from "react";
import { Button } from "../../components/Button";
import { ToastProvider } from "../../components/Toast";
import { AdminHeader } from "../../features/admin/AdminHeader";
import { CreditsDialog } from "../../features/admin/CreditsDialog";
import { InviteBetaDialog } from "../../features/admin/InviteBetaDialog";
import { LoadMoreButton } from "../../features/admin/LoadMoreButton";
import { MetaTesterDialog } from "../../features/admin/MetaTesterDialog";
import { StatusActionDialog } from "../../features/admin/StatusActionDialog";
import { useAdminWorkspaces } from "../../features/admin/use-admin";
import {
  WorkspacesTable,
  type WorkspaceAction,
} from "../../features/admin/WorkspacesTable";
import { t } from "../../i18n/es-AR";

type OpenDialog =
  { kind: "invite" } | { kind: "metaTester" } | WorkspaceAction | null;

function Admin() {
  const workspaces = useAdminWorkspaces();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);

  return (
    <>
      <AdminHeader />
      <main className="p-4">
        <section aria-labelledby="admin-titulo">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h1 id="admin-titulo" className="text-xl font-semibold">
              {t("admin.title")}
            </h1>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setDialog({ kind: "metaTester" })}
              >
                {t("admin.addMetaTester")}
              </Button>
              <Button onClick={() => setDialog({ kind: "invite" })}>
                {t("admin.inviteBeta")}
              </Button>
            </div>
          </div>
          <WorkspacesTable
            workspaces={
              workspaces.data?.pages.flatMap((page) => page.data) ?? []
            }
            loading={workspaces.isPending}
            error={workspaces.isError}
            onRetry={() => void workspaces.refetch()}
            onAction={setDialog}
          />
          {workspaces.hasNextPage && (
            <LoadMoreButton
              loading={workspaces.isFetchingNextPage}
              onClick={() => void workspaces.fetchNextPage()}
            />
          )}
        </section>
      </main>
      {dialog?.kind === "invite" && <InviteBetaDialog onClose={closeDialog} />}
      {dialog?.kind === "metaTester" && (
        <MetaTesterDialog onClose={closeDialog} />
      )}
      {dialog?.kind === "credits" && (
        <CreditsDialog workspace={dialog.workspace} onClose={closeDialog} />
      )}
      {(dialog?.kind === "suspend" || dialog?.kind === "restore") && (
        <StatusActionDialog
          kind={dialog.kind}
          workspace={dialog.workspace}
          onClose={closeDialog}
        />
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <Admin />
    </ToastProvider>
  );
}
