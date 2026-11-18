import { useState } from "react";
import { Button } from "../../components/Button";
import { Textarea } from "../../components/TextField";
import { t } from "../../i18n/es-AR";

const REASON_MAX = 500;

type DismissFormProps = {
  submitting: boolean;
  onSubmit: (reason: string | undefined) => void;
  onCancel: () => void;
};

export function DismissForm({
  submitting,
  onSubmit,
  onCancel,
}: DismissFormProps) {
  const [reason, setReason] = useState("");

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-sm border border-rule bg-paper p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason.trim() || undefined);
      }}
    >
      <Textarea
        label={t("pilot.dismissReason")}
        value={reason}
        limit={REASON_MAX}
        maxLength={REASON_MAX}
        disabled={submitting}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" disabled={submitting} onClick={onCancel}>
          {t("pilot.cancel")}
        </Button>
        <Button
          type="submit"
          variant="secondary"
          loading={submitting}
          loadingLabel={t("common.working")}
        >
          {t("pilot.dismissConfirm")}
        </Button>
      </div>
    </form>
  );
}
