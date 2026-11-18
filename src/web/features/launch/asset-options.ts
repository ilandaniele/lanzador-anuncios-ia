import type { AssetDto } from "../../../shared/schemas/meta-connections";
import type { ComboboxOption } from "../../components/Combobox";

export const assetValue = ({ kind, id, metaId }: AssetDto) =>
  kind === "ad_account" ? id : metaId;

export const assetOptions = (
  assets: AssetDto[],
  kind: AssetDto["kind"],
  parentMetaId?: string,
): ComboboxOption[] =>
  assets
    .filter(
      (asset) =>
        asset.kind === kind &&
        (parentMetaId === undefined || asset.parentMetaId === parentMetaId),
    )
    .map((asset) => ({ value: assetValue(asset), label: asset.name }));
