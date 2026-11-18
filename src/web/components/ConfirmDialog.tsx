import { useState, type ReactNode } from "react";
import { t } from "../i18n/es-AR";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Input } from "./TextField";

export type ReceiptRow = { label: string; value: string };

type ConfirmDialogProps = {
  title: string;
  confirmLabel: string;
  submittingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  amount?: string;
  rows?: ReceiptRow[];
  consequence?: string;
  submitting?: boolean;
  errorMessage?: string;
  requireText?: string;
  children?: ReactNode;
};

export function ConfirmDialog({
  title,
  confirmLabel,
  submittingLabel = t("common.working"),
  onConfirm,
  onCancel,
  amount,
  rows = [],
  consequence,
  submitting = false,
  errorMessage,
  requireText,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const textMismatch = requireText !== undefined && typed !== requireText;

  return (
    <Dialog title={title} onClose={onCancel} closable={!submitting}>
      {amount && (
        <p className="mb-4 text-3xl font-semibold tabular-nums">{amount}</p>
      )}
      {rows.length > 0 && (
        <dl className="mb-4 border-y border-rule">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-rule py-2 last:border-b-0"
            >
              <dt className="text-ink-muted">{row.label}</dt>
              <dd className="text-right tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="mb-4">{children}</div>}
      {consequence && <p className="mb-4 text-ink-muted">{consequence}</p>}
      {requireText !== undefined && (
        <div className="mb-4">
          <Input
            label={`${t("dialog.typeToConfirm")}: ${requireText}`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </div>
      )}
      {errorMessage && (
        <p role="alert" className="mb-4 rounded-sm bg-loss-soft p-3 text-loss">
          {errorMessage}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          data-autofocus
          disabled={submitting}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        <Button
          loading={submitting}
          loadingLabel={submittingLabel}
          disabledReason={textMismatch ? t("dialog.typeToConfirm") : undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
