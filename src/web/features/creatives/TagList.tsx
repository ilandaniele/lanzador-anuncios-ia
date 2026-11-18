import type { CreativeDto } from "../../../shared/schemas/creatives";
import { cx } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { displayTags, isUnconfirmed } from "./creative-filters";

export function TagList({ creative }: { creative: CreativeDto }) {
  const tags = displayTags(creative.tags);
  const dashed = isUnconfirmed(creative);
  if (tags.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li
          key={tag}
          className={cx(
            "rounded-xs border px-2 py-0.5 text-2xs",
            dashed
              ? "border-dashed border-pencil text-pencil"
              : "border-rule-strong text-ink",
          )}
        >
          {tag}
          {dashed && (
            <span className="sr-only"> ({t("creatives.aiUnconfirmed")})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
