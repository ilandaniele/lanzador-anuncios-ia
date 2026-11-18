import type { CreativeDto } from "../../../shared/schemas/creatives";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { creativeState } from "../launch/creative-state";
import { CreativeStatusChip } from "../launch/CreativeStatusChip";
import { Thumbnail } from "../launch/Thumbnail";
import { TagList } from "./TagList";
import { UsedIn } from "./UsedIn";

export type CreativeLayout = "grid" | "list";

type CreativeEntryProps = {
  creative: CreativeDto;
  layout: CreativeLayout;
  selectable: boolean;
  chosen: boolean;
  onToggle: () => void;
  onOpen: () => void;
};

export function CreativeEntry({
  creative,
  layout,
  selectable,
  chosen,
  onToggle,
  onOpen,
}: CreativeEntryProps) {
  const state = creativeState(creative);
  const isGrid = layout === "grid";

  return (
    <li
      className={cx(
        "group flex gap-3 rounded-sm border bg-surface p-3",
        isGrid ? "flex-col" : "items-center",
        chosen ? "border-primary bg-primary-soft" : "border-rule-strong",
      )}
    >
      <div className={cx("relative shrink-0", !isGrid && "w-16")}>
        <button
          type="button"
          aria-label={`${t("creatives.open")} ${creative.name}`}
          onClick={onOpen}
          className={cx("block w-full rounded-xs", focusRing)}
        >
          <Thumbnail
            url={creative.thumbnailUrl}
            className="aspect-[4/5] w-full"
          />
        </button>
        {selectable && state === "ready" && (
          <input
            type="checkbox"
            aria-label={`${t("creatives.choose")} ${creative.name}`}
            checked={chosen}
            onChange={onToggle}
            className="absolute left-2 top-2 size-5 opacity-0 focus:opacity-100 group-hover:opacity-100 checked:opacity-100 pointer-coarse:opacity-100"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">{creative.name}</span>
        {state !== "ready" && <CreativeStatusChip state={state} />}
        <TagList creative={creative} />
        <UsedIn count={creative.usedInLaunches} />
      </div>
    </li>
  );
}
