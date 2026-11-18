import type { CreativeDto } from "../../../shared/schemas/creatives";
import { t } from "../../i18n/es-AR";
import { CreativeRow } from "./CreativeRow";
import { itemKey, moveItem, type DraftItem } from "./draft-items";
import type { ChangeItems } from "./use-draft-items";
import { useDragReorder } from "./use-drag-reorder";

type CreativeListProps = {
  items: DraftItem[];
  creatives: Map<string, CreativeDto>;
  max: number;
  changeItems: ChangeItems;
};

export function CreativeList({
  items,
  creatives,
  max,
  changeItems,
}: CreativeListProps) {
  const move = (from: number, to: number) =>
    changeItems((current) => moveItem(current, from, to));
  const { handleProps, targetProps } = useDragReorder(move);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{t("launcher.step4.listTitle")}</h2>
        <p aria-live="polite" className="tabular-nums text-ink-muted">
          {items.length} {t("launcher.step4.counterOf")} {max}{" "}
          {t("launcher.step4.counterUnit")}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-ink-muted">{t("launcher.step4.listEmpty")}</p>
      ) : (
        <>
          <p className="text-ink-muted">{t("launcher.step4.dragHint")}</p>
          <ul aria-label={t("launcher.step4.listLabel")}>
            {items.map((item, index) => (
              <CreativeRow
                key={itemKey(item)}
                item={item}
                creative={
                  item.creativeId ? creatives.get(item.creativeId) : undefined
                }
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
                onRename={(adName) =>
                  changeItems((current) =>
                    current.map((candidate, at) =>
                      at === index ? { ...candidate, adName } : candidate,
                    ),
                  )
                }
                onRemove={() =>
                  changeItems((current) =>
                    current.filter((_, at) => at !== index),
                  )
                }
                handleProps={handleProps(index)}
                targetProps={targetProps(index)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
