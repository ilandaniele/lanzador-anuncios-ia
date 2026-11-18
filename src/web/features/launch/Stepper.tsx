import { cx, focusRing } from "../../components/classes";
import { t, type TextKey } from "../../i18n/es-AR";

export type StepperStep = {
  label: TextKey;
  complete: boolean;
  reachable: boolean;
};

type StepperProps = {
  steps: StepperStep[];
  currentIndex: number;
  onSelect: (index: number) => void;
};

function circleClass(current: boolean, complete: boolean) {
  if (current) return "bg-primary text-on-primary";
  if (complete) return "border border-primary bg-primary-soft text-primary";
  return "border border-rule-strong text-ink-subtle";
}

export function Stepper({ steps, currentIndex, onSelect }: StepperProps) {
  const currentLabel = t(steps[currentIndex]!.label);
  return (
    <nav aria-label={t("launcher.stepperLabel")}>
      <p className="font-semibold md:hidden">
        {`${t("launcher.stepCounter")} ${currentIndex + 1} ${t("launcher.stepOf")} ${steps.length} · ${currentLabel}`}
      </p>
      <ol className="hidden items-center gap-2 md:flex">
        {steps.map((step, index) => {
          const current = index === currentIndex;
          return (
            <li key={step.label} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!step.reachable}
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(index)}
                className={cx(
                  "flex min-h-10 items-center gap-2 rounded-sm px-2 disabled:text-ink-subtle",
                  current ? "font-semibold" : "text-ink",
                  focusRing,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex size-6 items-center justify-center rounded-full text-sm",
                    circleClass(current, step.complete),
                  )}
                >
                  {step.complete && !current ? "✓" : index + 1}
                </span>
                {t(step.label)}
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="h-px w-4 bg-rule-strong" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
