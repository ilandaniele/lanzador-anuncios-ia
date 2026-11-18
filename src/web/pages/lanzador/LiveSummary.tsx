import { useState } from "react";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { cx, focusRing } from "../../components/classes";
import { useSummaryRows } from "../../features/launch/use-summary-rows";
import { t } from "../../i18n/es-AR";

type LiveSummaryProps = {
  workspaceId: string;
  draft: PartialLaunchDraft;
  onSelectStep: (index: number) => void;
};

export function LiveSummary({
  workspaceId,
  draft,
  onSelectStep,
}: LiveSummaryProps) {
  const [open, setOpen] = useState(false);
  const rows = useSummaryRows(workspaceId, draft);

  return (
    <aside
      aria-label={t("launcher.summary.title")}
      className="rounded-sm border border-rule bg-surface p-4 xl:w-80 xl:shrink-0"
    >
      <h2 className="font-semibold">{t("launcher.summary.title")}</h2>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx("text-primary xl:hidden", focusRing)}
      >
        {t(open ? "launcher.summary.hide" : "launcher.summary.show")}
      </button>
      <ul
        className={cx("mt-2 flex-col gap-1", open ? "flex" : "hidden xl:flex")}
      >
        {rows.map(({ key, label, value, step }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelectStep(step)}
              className={cx(
                "flex w-full justify-between gap-2 rounded-xs py-1 text-left hover:bg-paper",
                focusRing,
              )}
            >
              <span className="text-ink-muted">{label}</span>
              <span className={value ? "text-ink" : "text-ink-subtle"}>
                {value ?? t("launcher.summary.empty")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
