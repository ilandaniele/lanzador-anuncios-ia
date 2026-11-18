import type { SelectOption } from "../../components/Select";
import { Select } from "../../components/Select";
import { SegmentedControl } from "../../components/SegmentedControl";
import { ToggleChip } from "../../components/Chip";
import { t } from "../../i18n/es-AR";
import type { CreativeLayout } from "./CreativeEntry";
import { sortOptions, type CreativeSort } from "./creative-filters";

const layoutOptions: { value: CreativeLayout; label: string }[] = [
  { value: "grid", label: t("creatives.layout.grid") },
  { value: "list", label: t("creatives.layout.list") },
];

type CreativesToolbarProps = {
  accounts: SelectOption[];
  accountId: string;
  onAccountChange: (accountId: string) => void;
  sort: CreativeSort;
  onSortChange: (sort: CreativeSort) => void;
  layout: CreativeLayout;
  onLayoutChange: (layout: CreativeLayout) => void;
  tags: string[];
  activeTag: string;
  onTagChange: (tag: string) => void;
};

export function CreativesToolbar({
  accounts,
  accountId,
  onAccountChange,
  sort,
  onSortChange,
  layout,
  onLayoutChange,
  tags,
  activeTag,
  onTagChange,
}: CreativesToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56">
          <Select
            label={t("creatives.accountLabel")}
            options={accounts}
            value={accountId}
            onChange={(event) => onAccountChange(event.target.value)}
          />
        </div>
        <div className="min-w-40">
          <Select
            label={t("creatives.sortLabel")}
            options={sortOptions}
            value={sort}
            onChange={(event) =>
              onSortChange(event.target.value as CreativeSort)
            }
          />
        </div>
        <SegmentedControl
          legend={t("creatives.layoutLegend")}
          options={layoutOptions}
          value={layout}
          onChange={onLayoutChange}
        />
      </div>
      {tags.length > 0 && (
        <div
          role="group"
          aria-label={t("creatives.tagsLabel")}
          className="flex flex-wrap gap-2"
        >
          {tags.map((tag) => (
            <ToggleChip
              key={tag}
              pressed={tag === activeTag}
              onToggle={(pressed) => onTagChange(pressed ? tag : "")}
            >
              {tag}
            </ToggleChip>
          ))}
        </div>
      )}
    </div>
  );
}
