import type { InvitationDto } from "../../../shared/schemas/invitations";
import type { MemberDto } from "../../../shared/schemas/members";
import { ConfirmDialog, type ReceiptRow } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { t, type TextKey } from "../../i18n/es-AR";
import { memberErrorMessage } from "./member-errors";
import {
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
} from "./use-members";

export type PendingAction =
  | { kind: "remove" | "transfer"; member: MemberDto }
  | { kind: "revoke"; invitation: InvitationDto };

type Copy = {
  title: TextKey;
  confirm: TextKey;
  consequence: TextKey;
  done: TextKey;
};

const COPY: Record<PendingAction["kind"], Copy> = {
  remove: {
    title: "members.removeTitle",
    confirm: "members.remove",
    consequence: "members.removeConsequence",
    done: "members.removed",
  },
  revoke: {
    title: "members.revokeTitle",
    confirm: "members.revoke",
    consequence: "members.revokeConsequence",
    done: "members.revoked",
  },
  transfer: {
    title: "members.transferTitle",
    confirm: "members.transferConfirm",
    consequence: "members.transferConsequence",
    done: "members.transferred",
  },
};

const identityRows = ({
  email,
  role,
}: Pick<MemberDto, "email" | "role">): ReceiptRow[] => [
  { label: t("members.colEmail"), value: email },
  { label: t("members.colRole"), value: t(`roles.${role}`) },
];

const transferRows = ({ email }: MemberDto): ReceiptRow[] => [
  { label: t("members.receiptNewOwner"), value: email },
  { label: t("members.receiptYourRole"), value: t("roles.admin") },
];

function receiptFor(action: PendingAction): { id: string; rows: ReceiptRow[] } {
  switch (action.kind) {
    case "revoke":
      return {
        id: action.invitation.id,
        rows: identityRows(action.invitation),
      };
    case "transfer":
      return { id: action.member.userId, rows: transferRows(action.member) };
    case "remove":
      return { id: action.member.userId, rows: identityRows(action.member) };
  }
}

type ConfirmActionProps = {
  workspaceId: string;
  action: PendingAction;
  onClose: () => void;
};

export function ConfirmAction({
  workspaceId,
  action,
  onClose,
}: ConfirmActionProps) {
  const mutations = {
    remove: useRemoveMember(workspaceId),
    revoke: useRevokeInvitation(workspaceId),
    transfer: useTransferOwnership(workspaceId),
  };
  const { notify } = useToast();
  const copy = COPY[action.kind];
  const mutation = mutations[action.kind];
  const { id, rows } = receiptFor(action);

  function confirm() {
    mutation.mutate(id, {
      onSuccess: () => {
        notify({ tone: "success", message: t(copy.done) });
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      title={t(copy.title)}
      confirmLabel={t(copy.confirm)}
      rows={rows}
      consequence={t(copy.consequence)}
      submitting={mutation.isPending}
      errorMessage={
        mutation.error ? memberErrorMessage(mutation.error) : undefined
      }
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
