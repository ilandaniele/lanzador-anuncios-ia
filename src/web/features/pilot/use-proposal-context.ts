import { useMemo } from "react";
import { useMetaAssets } from "../launch/use-meta-assets";
import { useCanDecide } from "./use-can-decide";

export type ProposalAccount = { name: string; currency?: string };

export function useProposalContext(workspaceId: string) {
  const assets = useMetaAssets(workspaceId);
  const canDecide = useCanDecide(workspaceId);
  const accounts = useMemo(
    () =>
      new Map<string, ProposalAccount>(
        assets.data?.map(({ metaId, name, currency }) => [
          metaId,
          { name, currency: currency ?? undefined },
        ]),
      ),
    [assets.data],
  );

  return {
    loading: assets.isPending,
    accountOf: (metaId: string) => accounts.get(metaId),
    canDecide,
  };
}
