import type { SelectHTMLAttributes } from "react";
import { controlClass, cx } from "./classes";
import { Field } from "./Field";

export type SelectOption = { value: string; label: string };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
};

export function Select({
  label,
  options,
  hint,
  error,
  className,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} required={rest.required} hint={hint} error={error}>
      {(control) => (
        <select
          {...rest}
          {...control}
          aria-required={rest.required || undefined}
          required={undefined}
          className={cx(controlClass, className)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
