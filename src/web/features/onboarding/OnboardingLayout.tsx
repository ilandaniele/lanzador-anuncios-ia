import type { ReactNode } from "react";
import { cx } from "../../components/classes";
import { t, type TextKey } from "../../i18n/es-AR";

export const ONBOARDING_STEPS: TextKey[] = [
  "onboarding.steps.name",
  "onboarding.steps.connect",
  "onboarding.steps.assets",
  "onboarding.steps.product",
];

function Stepper({ currentIndex }: { currentIndex: number }) {
  return (
    <nav aria-label={t("onboarding.stepperLabel")}>
      <ol className="flex flex-wrap gap-x-4 gap-y-1">
        {ONBOARDING_STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === currentIndex ? "step" : undefined}
            className={cx(
              index === currentIndex
                ? "font-semibold text-ink"
                : "text-ink-subtle",
            )}
          >
            {`${index + 1}. ${t(label)}`}
          </li>
        ))}
      </ol>
    </nav>
  );
}

type OnboardingLayoutProps = {
  currentIndex: number;
  wide?: boolean;
  children: ReactNode;
};

export function OnboardingLayout({
  currentIndex,
  wide = false,
  children,
}: OnboardingLayoutProps) {
  return (
    <main
      className={cx(
        "mx-auto flex min-h-dvh w-full flex-col justify-center gap-6 px-4 py-8 text-md",
        wide ? "max-w-5xl" : "max-w-140",
      )}
    >
      <h1 className="text-xl font-semibold text-ink">
        {t("onboarding.title")}
      </h1>
      <Stepper currentIndex={currentIndex} />
      {children}
    </main>
  );
}
