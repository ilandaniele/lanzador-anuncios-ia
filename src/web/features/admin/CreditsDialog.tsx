import { useState, type FormEvent } from "react";
import type { AdminWorkspaceDto } from "../../../shared/schemas/admin";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Input } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { parseNeuronsOverride } from "./neurons-override";
import { usePatchAdminWorkspace } from "./use-admin";

type CreditsDialogProps = {
  workspace: AdminWorkspaceDto;
  onClose: () => void;
};

export function CreditsDialog({ workspace, onClose }: CreditsDialogProps) {
  const [daily, setDaily] = useState("");
  const [monthly, setMonthly] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const patch = usePatchAdminWorkspace();
  const { notify } = useToast();

  const parsedDaily = parseNeuronsOverride(daily);
  const parsedMonthly = parseNeuronsOverride(monthly);
  const errorFor = (valid: boolean) =>
    submitted && !valid ? t("admin.creditsInvalid") : undefined;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!parsedDaily.valid || !parsedMonthly.valid) return;
    patch.mutate(
      {
        id: workspace.id,
        patch: {
          aiDailyNeuronsOverride: parsedDaily.value,
          aiMonthlyNeuronsOverride: parsedMonthly.value,
        },
      },
      {
        onSuccess: () => {
          notify({ tone: "success", message: t("admin.creditsSaved") });
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      title={`${t("admin.creditsTitle")}: ${workspace.name}`}
      onClose={onClose}
      closable={!patch.isPending}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label={t("admin.creditsDaily")}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={daily}
          error={errorFor(parsedDaily.valid)}
          onChange={(event) => setDaily(event.target.value)}
        />
        <Input
          label={t("admin.creditsMonthly")}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={monthly}
          error={errorFor(parsedMonthly.valid)}
          onChange={(event) => setMonthly(event.target.value)}
        />
        <p className="text-ink-muted">{t("admin.creditsHint")}</p>
        {patch.error && (
          <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
            {t("errors.generic")}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            variant="secondary"
            disabled={patch.isPending}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={patch.isPending}
            loadingLabel={t("common.working")}
          >
            {t("admin.creditsSave")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
