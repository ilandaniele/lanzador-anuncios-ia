import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { useLaunch } from "../launch/use-draft";
import { useSummaryRows } from "../launch/use-summary-rows";

const SUMMARY_KEYS = ["product", "account", "creatives", "budget", "countries"];

type DraftCardProps = {
  workspaceId: string;
  launchId: string;
  onOpen: (launchId: string) => void;
};

export function DraftCard({ workspaceId, launchId, onOpen }: DraftCardProps) {
  const draft = useLaunch(workspaceId, launchId).data?.launch.draft ?? {};
  const rows = useSummaryRows(workspaceId, draft).filter(
    ({ key, value }) => SUMMARY_KEYS.includes(key) && value,
  );

  return (
    <article
      aria-label={t("chat.draftTitle")}
      className="border-pencil bg-surface flex flex-col gap-3 rounded-md border-[1.5px] border-dashed p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t("chat.draftTitle")}</h3>
        <span className="text-ink-muted text-sm">
          <span aria-hidden="true">✎ </span>
          {t("chat.draftBadge")}
        </span>
      </header>
      {rows.length > 0 && (
        <dl className="flex flex-col gap-1">
          {rows.map(({ key, label, value }) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-ink-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button onClick={() => onOpen(launchId)}>{t("chat.openDraft")}</Button>
    </article>
  );
}
