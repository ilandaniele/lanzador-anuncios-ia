import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import type { FieldSpec } from "./rule-fields";

const inlineControlClass = cx(
  "mx-1 min-h-8 rounded-sm border border-rule-strong bg-surface px-2 py-1 text-ink",
  "hover:border-ink-muted aria-invalid:border-2 aria-invalid:border-loss",
  "pointer-coarse:min-h-11",
  focusRing,
);

type RuleFieldProps = {
  spec: FieldSpec;
  ruleName: string;
  value: string;
  invalid: boolean;
  describedBy: string;
  onChange: (value: string) => void;
};

export function RuleField({
  spec,
  ruleName,
  value,
  invalid,
  describedBy,
  onChange,
}: RuleFieldProps) {
  const shared = {
    "aria-label": `${ruleName}: ${t(`pilot.rules.field.${spec.key}`)}`,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? describedBy : undefined,
    value,
  };

  if (spec.kind === "choice")
    return (
      <select
        {...shared}
        className={inlineControlClass}
        onChange={(event) => onChange(event.target.value)}
      >
        {spec.options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.label)}
          </option>
        ))}
      </select>
    );

  return (
    <input
      {...shared}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cx(inlineControlClass, "w-20 text-right tabular-nums")}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
