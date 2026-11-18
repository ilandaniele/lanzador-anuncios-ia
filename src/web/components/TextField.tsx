import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { t } from "../i18n/es-AR";
import { controlClass, cx } from "./classes";
import { Field } from "./Field";

const WARN_RATIO = 0.9;

type FieldOptions = {
  label: string;
  hint?: string;
  error?: string;
  limit?: number;
};

function Counter({ length, limit }: { length: number; limit: number }) {
  const exceeded = length > limit;
  const tone = exceeded
    ? "text-loss"
    : length >= limit * WARN_RATIO
      ? "text-warn"
      : "text-ink-subtle";
  return (
    <span className={cx("tabular-nums", tone)} data-testid="counter">
      {length} / {limit}
      {exceeded && <span className="sr-only"> {t("field.limitExceeded")}</span>}
    </span>
  );
}

function counterFor(value: unknown, limit?: number) {
  if (limit === undefined) return undefined;
  return <Counter length={String(value ?? "").length} limit={limit} />;
}

type InputProps = FieldOptions & InputHTMLAttributes<HTMLInputElement>;

export function Input({
  label,
  hint,
  error,
  limit,
  className,
  ...rest
}: InputProps) {
  return (
    <Field
      label={label}
      required={rest.required}
      hint={hint}
      error={error}
      counter={counterFor(rest.value, limit)}
    >
      {(control) => (
        <input
          {...rest}
          {...control}
          aria-required={rest.required || undefined}
          required={undefined}
          className={cx(controlClass, className)}
        />
      )}
    </Field>
  );
}

type TextareaProps = FieldOptions & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  label,
  hint,
  error,
  limit,
  className,
  ...rest
}: TextareaProps) {
  return (
    <Field
      label={label}
      required={rest.required}
      hint={hint}
      error={error}
      counter={counterFor(rest.value, limit)}
    >
      {(control) => (
        <textarea
          {...rest}
          {...control}
          aria-required={rest.required || undefined}
          required={undefined}
          rows={rest.rows ?? 3}
          className={cx(controlClass, className)}
        />
      )}
    </Field>
  );
}
