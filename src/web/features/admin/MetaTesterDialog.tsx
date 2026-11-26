import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Input } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { metaTesterErrorMessage } from "./admin-errors";
import { useAddMetaTester } from "./use-admin";

export function MetaTesterDialog({ onClose }: { onClose: () => void }) {
  const [facebookUserId, setFacebookUserId] = useState("");
  const addTester = useAddMetaTester();
  const { notify } = useToast();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    addTester.mutate(
      { facebookUserId },
      {
        onSuccess: () => {
          notify({ tone: "success", message: t("admin.addMetaTesterDone") });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      title={t("admin.addMetaTesterTitle")}
      onClose={onClose}
      closable={!addTester.isPending}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t("admin.addMetaTesterId")}
          hint={t("admin.addMetaTesterHint")}
          inputMode="numeric"
          pattern="\d{5,25}"
          required
          autoComplete="off"
          value={facebookUserId}
          onChange={(event) => setFacebookUserId(event.target.value.trim())}
        />
        {addTester.error && (
          <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
            {metaTesterErrorMessage(addTester.error)}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            variant="secondary"
            disabled={addTester.isPending}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={addTester.isPending}
            loadingLabel={t("common.working")}
          >
            {t("admin.addMetaTesterSubmit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
