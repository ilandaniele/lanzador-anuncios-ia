import type { LaunchProgress } from "../../../shared/schemas/launch";
import { StatusChip } from "../../components/Chip";
import { t } from "../../i18n/es-AR";
import { itemLabel, itemTone } from "./progress-model";

type ProgressItem = LaunchProgress["items"][number];

function ProgressRow({ item }: { item: ProgressItem }) {
  return (
    <li className="flex flex-col gap-1 border-b border-rule px-3 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{item.adName}</span>
        <StatusChip tone={itemTone(item.status)}>
          {itemLabel(item.status)}
        </StatusChip>
      </div>
      {item.status === "failed" && (
        <div className="text-loss">
          <p>{item.error ?? t("launchProgress.errorFallback")}</p>
          <p className="text-ink-muted">{t("launchProgress.errorHint")}</p>
        </div>
      )}
    </li>
  );
}

export function ProgressItemList({ items }: { items: ProgressItem[] }) {
  if (items.length === 0)
    return <p className="text-ink-muted">{t("launchProgress.noErrors")}</p>;
  return (
    <ul
      aria-label={t("launchProgress.listLabel")}
      className="border-y border-rule bg-surface"
    >
      {items.map((item) => (
        <ProgressRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
