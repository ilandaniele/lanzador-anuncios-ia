import { Link } from "react-router";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import type { Blocker } from "./blocker-steps";

export function BlockerList({ blockers }: { blockers: Blocker[] }) {
  return (
    <section
      role="alert"
      className="rounded-sm border border-loss bg-loss-soft p-3"
    >
      <h3 className="font-semibold text-loss">
        {t("launcher.review.blockersTitle")}
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {blockers.map(({ key, text, step }, index) => (
          <li
            key={`${key}-${index}`}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>{text}</span>
            {step !== undefined && (
              <Link
                to={{ search: `?paso=${step + 1}` }}
                className={cx("text-primary underline", focusRing)}
              >
                {`${t("launcher.review.goToStep")} ${step + 1}`}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
