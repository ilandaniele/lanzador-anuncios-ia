import { useState } from "react";
import { cx, focusRing } from "../../components/classes";
import { t } from "../../i18n/es-AR";

const LONG_TEXT_CHARS = 180;

export function ProposalExplanation({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = text.length > LONG_TEXT_CHARS;

  return (
    <div>
      <p className={cx("text-md", collapsible && !expanded && "line-clamp-3")}>
        {text}
      </p>
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className={cx("text-primary underline", focusRing)}
        >
          {t(expanded ? "pilot.showLess" : "pilot.showMore")}
        </button>
      )}
    </div>
  );
}
