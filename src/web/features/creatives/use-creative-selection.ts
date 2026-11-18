import { useState } from "react";
import { useNavigate } from "react-router";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { workspacePath } from "../../layout/nav-items";
import { creativeState } from "../launch/creative-state";
import { itemFromCreative } from "../launch/draft-items";
import { useCreateDraft } from "../launch/use-draft";

export function useCreativeSelection(
  workspaceId: string,
  adAccountAssetId: string,
  creatives: CreativeDto[],
) {
  const navigate = useNavigate();
  const createDraft = useCreateDraft(workspaceId);
  const [chosenIds, setChosenIds] = useState<ReadonlySet<string>>(new Set());
  const chosen = creatives.filter(
    (creative) =>
      chosenIds.has(creative.id) && creativeState(creative) === "ready",
  );

  const toggle = (creativeId: string) =>
    setChosenIds((current) => {
      const next = new Set(current);
      if (!next.delete(creativeId)) next.add(creativeId);
      return next;
    });

  const clear = () => setChosenIds(new Set());

  const useInLaunch = () =>
    createDraft.mutate(
      {
        draft: { adAccountAssetId, items: chosen.map(itemFromCreative) },
      },
      {
        onSuccess: ({ id }) =>
          navigate(workspacePath(workspaceId, `lanzador/${id}`)),
      },
    );

  return {
    chosenIds,
    chosenCount: chosen.length,
    toggle,
    clear,
    useInLaunch,
    creating: createDraft.isPending,
    failed: createDraft.isError,
  };
}
