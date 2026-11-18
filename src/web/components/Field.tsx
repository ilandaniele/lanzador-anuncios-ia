import { useId, type ReactNode } from "react";
import { t } from "../i18n/es-AR";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  counter?: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
};

export function Field({
  label,
  required,
  hint,
  error,
  counter,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-medium text-ink">
          {label}
          {required && (
            <span className="ml-1 font-normal text-ink-muted">
              {t("common.required")}
            </span>
          )}
        </label>
        {counter}
      </div>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-loss">
          <span aria-hidden="true">⊗ </span>
          {error}
        </p>
      )}
    </div>
  );
}
