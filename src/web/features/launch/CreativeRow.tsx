import { useState, type ComponentProps } from "react";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { Button } from "../../components/Button";
import { controlClass } from "../../components/classes";
import { t } from "../../i18n/es-AR";
import { creativeState } from "./creative-state";
import { CreativeStatusChip } from "./CreativeStatusChip";
import type { DraftItem } from "./draft-items";
import { Thumbnail } from "./Thumbnail";

const NAME_MAX = 120;

type CreativeRowProps = {
  item: DraftItem;
  creative: CreativeDto | undefined;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  handleProps: ComponentProps<"span">;
  targetProps: ComponentProps<"li">;
};

function ItemName({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (name: string) => void;
}) {
  const [value, setValue] = useState(name);

  function commit() {
    const trimmed = value.trim();
    setValue(trimmed || name);
    if (trimmed) onCommit(trimmed);
  }

  return (
    <input
      aria-label={`${t("launcher.step4.nameLabel")} ${name}`}
      value={value}
      maxLength={NAME_MAX}
      className={controlClass}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
    />
  );
}

export function CreativeRow({
  item,
  creative,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onRemove,
  handleProps,
  targetProps,
}: CreativeRowProps) {
  return (
    <li
      {...targetProps}
      className="flex flex-wrap items-center gap-3 border-b border-rule py-2"
    >
      <span
        {...handleProps}
        data-testid="drag-handle"
        aria-hidden="true"
        className="cursor-grab px-1 text-ink-subtle"
      >
        ⠿
      </span>
      <Thumbnail url={creative?.thumbnailUrl ?? null} />
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <ItemName name={item.adName} onCommit={onRename} />
        {creative && <CreativeStatusChip state={creativeState(creative)} />}
        {item.source === "clone" && (
          <span className="text-2xs text-ink-muted">
            {t("launcher.step4.sourceClone")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          aria-label={`${t("launcher.step4.moveUp")} ${item.adName}`}
          disabledReason={isFirst ? t("launcher.step4.isFirst") : undefined}
          onClick={onMoveUp}
        >
          {t("launcher.step4.moveUp")}
        </Button>
        <Button
          variant="ghost"
          aria-label={`${t("launcher.step4.moveDown")} ${item.adName}`}
          disabledReason={isLast ? t("launcher.step4.isLast") : undefined}
          onClick={onMoveDown}
        >
          {t("launcher.step4.moveDown")}
        </Button>
        <Button
          variant="ghost"
          aria-label={`${t("launcher.step4.remove")} ${item.adName}`}
          onClick={onRemove}
        >
          {t("launcher.step4.remove")}
        </Button>
      </div>
    </li>
  );
}
