import type { InvitableRole } from "../../../shared/constants";
import type { InvitationDto } from "../../../shared/schemas/invitations";
import type { MemberDto } from "../../../shared/schemas/members";
import { Button } from "../../components/Button";
import { controlClass } from "../../components/classes";
import { DataTable, type Column } from "../../components/DataTable";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import type { PendingAction } from "./ConfirmAction";
import { memberErrorMessage } from "./member-errors";
import { roleOptions } from "./role-options";
import { useChangeMemberRole } from "./use-members";

type Row =
  | { kind: "member"; member: MemberDto }
  | { kind: "invitation"; invitation: InvitationDto };

const rowKey = (row: Row) =>
  row.kind === "member" ? row.member.userId : row.invitation.id;

const rowEmail = (row: Row) =>
  row.kind === "member" ? row.member.email : row.invitation.email;

const rowRole = (row: Row) =>
  row.kind === "member" ? row.member.role : row.invitation.role;

const rowName = (row: Row) =>
  row.kind === "member" ? (row.member.name ?? "—") : "—";

function statusLabel(row: Row): string {
  if (row.kind === "member") return t("members.statusActive");
  return row.invitation.status === "expired"
    ? t("members.statusExpired")
    : t("members.statusPending");
}

type RoleSelectProps = { workspaceId: string; member: MemberDto };

function RoleSelect({ workspaceId, member }: RoleSelectProps) {
  const changeRole = useChangeMemberRole(workspaceId);
  const { notify } = useToast();

  function handleChange(role: InvitableRole) {
    changeRole.mutate(
      { userId: member.userId, role },
      {
        onSuccess: () =>
          notify({ tone: "success", message: t("members.roleChanged") }),
        onError: (error) =>
          notify({ tone: "error", message: memberErrorMessage(error) }),
      },
    );
  }

  return (
    <select
      aria-label={`${t("members.roleOf")} ${member.email}`}
      className={controlClass}
      value={member.role}
      disabled={changeRole.isPending}
      onChange={(event) => handleChange(event.target.value as InvitableRole)}
    >
      {roleOptions.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

type MembersTableProps = {
  workspaceId: string;
  members: MemberDto[];
  invitations: InvitationDto[];
  currentUserId: string;
  canManage: boolean;
  isOwner: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onAction: (action: PendingAction) => void;
};

export function MembersTable({
  workspaceId,
  members,
  invitations,
  currentUserId,
  canManage,
  isOwner,
  loading,
  error,
  onRetry,
  onAction,
}: MembersTableProps) {
  const rows: Row[] = [
    ...members.map((member): Row => ({ kind: "member", member })),
    ...invitations.map((invitation): Row => ({
      kind: "invitation",
      invitation,
    })),
  ];

  function renderRole(row: Row) {
    if (row.kind === "member" && canManage && row.member.role !== "owner") {
      return <RoleSelect workspaceId={workspaceId} member={row.member} />;
    }
    return t(`roles.${rowRole(row)}`);
  }

  function renderActions(row: Row) {
    if (row.kind === "invitation") {
      return (
        <Button
          variant="ghost"
          onClick={() =>
            onAction({ kind: "revoke", invitation: row.invitation })
          }
        >
          {t("members.revoke")}
        </Button>
      );
    }
    if (row.member.userId === currentUserId) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {isOwner && (
          <Button
            variant="ghost"
            onClick={() => onAction({ kind: "transfer", member: row.member })}
          >
            {t("members.transfer")}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => onAction({ kind: "remove", member: row.member })}
        >
          {t("members.remove")}
        </Button>
      </div>
    );
  }

  const columns: Column<Row>[] = [
    {
      key: "email",
      header: t("members.colEmail"),
      render: rowEmail,
      rowHeader: true,
    },
    { key: "name", header: t("members.colName"), render: rowName },
    { key: "role", header: t("members.colRole"), render: renderRole },
    { key: "status", header: t("members.colStatus"), render: statusLabel },
  ];
  if (canManage) {
    columns.push({
      key: "actions",
      header: t("members.colActions"),
      render: renderActions,
    });
  }

  return (
    <DataTable
      caption={t("members.caption")}
      columns={columns}
      rows={rows}
      getRowKey={rowKey}
      loading={loading}
      error={error ? t("members.loadError") : undefined}
      onRetry={onRetry}
      empty={t("members.empty")}
    />
  );
}
