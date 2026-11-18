import { useId } from "react";

export type SegmentedOption<Value extends string> = {
  value: Value;
  label: string;
};

type SegmentedControlProps<Value extends string> = {
  legend: string;
  options: SegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
};

export function SegmentedControl<Value extends string>({
  legend,
  options,
  value,
  onChange,
}: SegmentedControlProps<Value>) {
  const name = useId();

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-medium text-ink">{legend}</legend>
      <div className="inline-flex overflow-hidden rounded-sm border border-rule-strong">
        {options.map((option) => (
          <label key={option.value} className="relative flex">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-10 items-center bg-surface px-3 text-ink peer-checked:bg-primary peer-checked:font-semibold peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-focus pointer-coarse:min-h-11">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
