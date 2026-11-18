import type { AssetKind } from "../../../shared/constants";
import type { AssetDto } from "../../../shared/schemas/meta-connections";
import type { TextKey } from "../../i18n/es-AR";

export const GROUP_LABELS: Record<AssetKind, TextKey> = {
  ad_account: "connections.picker.groups.ad_account",
  page: "connections.picker.groups.page",
  instagram: "connections.picker.groups.instagram",
  pixel: "connections.picker.groups.pixel",
};

export type AssetDraft = Record<string, boolean>;

export const isEnabled = (asset: AssetDto, draft: AssetDraft) =>
  draft[asset.id] ?? asset.enabled;

export function matchesSearch({ name, metaId }: AssetDto, search: string) {
  const needle = search.trim().toLowerCase();
  return (
    needle === "" ||
    name.toLowerCase().includes(needle) ||
    metaId.toLowerCase().includes(needle)
  );
}

export function withEnabled(
  draft: AssetDraft,
  assets: AssetDto[],
  enabled: boolean,
): AssetDraft {
  const next = { ...draft };
  for (const asset of assets) {
    if (enabled === asset.enabled) delete next[asset.id];
    else next[asset.id] = enabled;
  }
  return next;
}

export const toChanges = (draft: AssetDraft) =>
  Object.entries(draft).map(([id, enabled]) => ({ id, enabled }));
