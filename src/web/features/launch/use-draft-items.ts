import { useCallback, useEffect, useRef } from "react";
import type { DraftItem } from "./draft-items";
import type { StepProps } from "./step-types";

export type ChangeItems = (
  change: (current: DraftItem[]) => DraftItem[],
) => void;

export function useDraftItems({
  draft,
  update,
}: Pick<StepProps, "draft" | "update">) {
  const items = draft.items ?? [];
  const latest = useRef(items);

  useEffect(() => {
    latest.current = items;
  });

  const changeItems = useCallback<ChangeItems>(
    (change) => {
      latest.current = change(latest.current);
      update({ items: latest.current });
    },
    [update],
  );

  return { items, changeItems };
}
