import { useState } from "react";
import { useParams } from "react-router";
import { ROLE_RANK } from "../../../shared/constants";
import { Button } from "../../components/Button";
import { ToastProvider } from "../../components/Toast";
import { useMe } from "../../features/auth/use-me";
import {
  ConfirmAction,
  type PendingAction,
} from "../../features/members/ConfirmAction";
import { InviteDialog } from "../../features/members/InviteDialog";
import { MembersTable } from "../../features/members/MembersTable";
import { useInvitations, useMembers } from "../../features/members/use-members";
import { t } from "../../i18n/es-AR";

type OpenDialog = { kind: "invite" } | PendingAction | null;

const LIVE_INVITATION_STATUSES = ["pending", "expired"];

function Members({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useMe();
  const role = me?.workspaces.find(({ id }) => id === workspaceId)?.role;
  const canManage = role !== undefined && ROLE_RANK[role] >= ROLE_RANK.admin;
  const members = useMembers(workspaceId);
  const invitations = useInvitations(workspaceId, canManage);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);

  const liveInvitations = (invitations.data ?? []).filter(({ status }) =>
    LIVE_INVITATION_STATUSES.includes(status),
  );

  return (
    <section aria-labelledby="miembros-titulo">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="miembros-titulo" className="text-xl font-semibold">
          {t("settings.members")}
        </h2>
        {canManage && (
          <Button onClick={() => setDialog({ kind: "invite" })}>
            {t("members.invite")}
          </Button>
        )}
      </div>
      <MembersTable
        workspaceId={workspaceId}
        members={members.data ?? []}
        invitations={liveInvitations}
        currentUserId={me?.user.id ?? ""}
        canManage={canManage}
        isOwner={role === "owner"}
        loading={members.isPending || (canManage && invitations.isPending)}
        error={members.isError || invitations.isError}
        onRetry={() => {
          void members.refetch();
          void invitations.refetch();
        }}
        onAction={setDialog}
      />
      {dialog?.kind === "invite" && (
        <InviteDialog workspaceId={workspaceId} onClose={closeDialog} />
      )}
      {dialog && dialog.kind !== "invite" && (
        <ConfirmAction
          workspaceId={workspaceId}
          action={dialog}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}

export default function MiembrosPage() {
  const { workspaceId = "" } = useParams();
  return (
    <ToastProvider>
      <Members workspaceId={workspaceId} />
    </ToastProvider>
  );
}
