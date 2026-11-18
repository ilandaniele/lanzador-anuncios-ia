import { useState } from "react";
import { MAX_SCALE_PERCENT } from "../../../shared/constants";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Field } from "../../components/Field";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import type { ScalableRow } from "./row-actions-model";
import { scaleErrorMessage } from "./scale-errors";
import { previewScaledBudget } from "./scale-preview";
import { useScaleAction } from "./use-row-actions";

const MIN_SCALE_PERCENT = 1;
const DEFAULT_SCALE_PERCENT = 20;

type ScaleDialogProps = {
  workspaceId: string;
  row: ScalableRow;
  onClose: () => void;
};

export function ScaleDialog({ workspaceId, row, onClose }: ScaleDialogProps) {
  const [percent, setPercent] = useState(DEFAULT_SCALE_PERCENT);
  const scale = useScaleAction(workspaceId, row, onClose);
  const money = (minor: number) => formatMoney(minor, row.currency);
  const next = previewScaledBudget(row.dailyBudgetMinor, percent);

  return (
    <ConfirmDialog
      title={t("metrics.actions.scaleTitle")}
      amount={`${money(next)} ${t("metrics.actions.perDay")}`}
      rows={[
        { label: t("metrics.actions.scaleObject"), value: row.name },
        {
          label: t("metrics.actions.scaleChange"),
          value: `${money(row.dailyBudgetMinor)} → ${money(next)}, +${percent} %`,
        },
      ]}
      consequence={t("metrics.actions.scaleConsequence")}
      confirmLabel={`${t("metrics.actions.scaleConfirm")} ${money(next)}`}
      submitting={scale.isPending}
      errorMessage={scale.isError ? scaleErrorMessage(scale.error) : undefined}
      onConfirm={() => scale.mutate(percent)}
      onCancel={onClose}
    >
      <Field label={t("metrics.actions.scalePercent")}>
        {(control) => (
          <div className="flex items-center gap-3">
            <input
              {...control}
              type="range"
              min={MIN_SCALE_PERCENT}
              max={MAX_SCALE_PERCENT}
              step={1}
              value={percent}
              disabled={scale.isPending}
              aria-valuetext={`${percent} %`}
              onChange={(event) => setPercent(Number(event.target.value))}
              className="flex-1"
            />
            <output
              htmlFor={control.id}
              className="w-12 text-right tabular-nums"
            >
              {percent} %
            </output>
          </div>
        )}
      </Field>
    </ConfirmDialog>
  );
}
