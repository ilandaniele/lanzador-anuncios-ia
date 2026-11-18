import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Input } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { inviteErrorMessage } from "./admin-errors";
import { useCreateBetaInvite } from "./use-admin";

export function InviteBetaDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const invite = useCreateBetaInvite();
  const { notify } = useToast();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedNote = note.trim();
    invite.mutate(
      { email, ...(trimmedNote && { note: trimmedNote }) },
      {
        onSuccess: () => {
          notify({ tone: "success", message: t("admin.inviteBetaDone") });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      title={t("admin.inviteBetaTitle")}
      onClose={onClose}
      closable={!invite.isPending}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t("admin.inviteBetaEmail")}
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label={t("admin.inviteBetaNote")}
          autoComplete="off"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {invite.error && (
          <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
            {inviteErrorMessage(invite.error)}
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
            {t("admin.inviteBetaSubmit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
