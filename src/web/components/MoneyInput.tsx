import { useState } from "react";
import {
  currencySymbol,
  formatMinorForInput,
  parseMoneyToMinor,
} from "../lib/money";
import { controlClass, cx } from "./classes";
import { Field } from "./Field";

type MoneyInputProps = {
  label: string;
  value: number | null;
  onChange: (minor: number | null) => void;
  currency?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

export function MoneyInput({
  label,
  value,
  onChange,
  currency = "USD",
  required,
  hint,
  error,
  disabled,
}: MoneyInputProps) {
  const [text, setText] = useState(formatMinorForInput(value));

  if (value !== parseMoneyToMinor(text)) setText(formatMinorForInput(value));

  return (
    <Field label={label} required={required} hint={hint} error={error}>
      {(control) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted"
          >
            {currencySymbol(currency)}
          </span>
          <input
            {...control}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            aria-required={required || undefined}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              onChange(parseMoneyToMinor(event.target.value));
            }}
            onBlur={() => setText(formatMinorForInput(value))}
            className={cx(controlClass, "pl-12 text-right tabular-nums")}
          />
        </div>
      )}
    </Field>
  );
}
