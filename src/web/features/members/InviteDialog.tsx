import { useState, type FormEvent } from "react";
import { INVITABLE_ROLES, type InvitableRole } from "../../../shared/constants";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Select } from "../../components/Select";
import { Input } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { memberErrorMessage } from "./member-errors";
import { roleOptions } from "./role-options";
import { useInviteMember } from "./use-members";

type InviteDialogProps = { workspaceId: string; onClose: () => void };

export function InviteDialog({ workspaceId, onClose }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("viewer");
  const invite = useInviteMember(workspaceId);
  const { notify } = useToast();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    invite.mutate(
      { email, role },
      {
        onSuccess: () => {
          notify({ tone: "success", message: t("members.invited") });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      title={t("members.inviteTitle")}
      onClose={onClose}
      closable={!invite.isPending}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t("members.inviteEmail")}
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select
          label={t("members.inviteRole")}
          options={roleOptions}
          value={role}
          onChange={(event) => setRole(event.target.value as InvitableRole)}
        />
        <section aria-label={t("members.rolesHelp")}>
          <dl className="flex flex-col gap-2 text-ink-muted">
            {INVITABLE_ROLES.map((key) => (
              <div key={key}>
                <dt className="font-medium text-ink">{t(`roles.${key}`)}</dt>
                <dd>{t(`members.roleDescription.${key}`)}</dd>
              </div>
            ))}
          </dl>
        </section>
        {invite.error && (
          <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
            {memberErrorMessage(invite.error)}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            variant="secondary"
            disabled={invite.isPending}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={invite.isPending}
            loadingLabel={t("common.working")}
          >
            {t("members.inviteSubmit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
