import type { AssetDto } from "../../../shared/schemas/meta-connections";
import { t } from "../../i18n/es-AR";
import { isEnabled, type AssetDraft } from "./asset-groups";

type AssetGroupProps = {
  title: string;
  assets: AssetDto[];
  visible: AssetDto[];
  draft: AssetDraft;
  onToggle: (asset: AssetDto, enabled: boolean) => void;
  onToggleAll: (assets: AssetDto[], enabled: boolean) => void;
};

export function AssetGroup({
  title,
  assets,
  visible,
  draft,
  onToggle,
  onToggleAll,
}: AssetGroupProps) {
  const enabledCount = assets.filter((asset) => isEnabled(asset, draft)).length;
  const visibleEnabled = visible.filter((asset) => isEnabled(asset, draft));
  const allVisible =
    visible.length > 0 && visibleEnabled.length === visible.length;
  const someVisible = visibleEnabled.length > 0 && !allVisible;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-lg font-semibold">{title}</legend>
      <div className="flex items-center justify-between border-b border-rule pb-2">
        <label className="flex items-center gap-3 font-medium">
          <input
            type="checkbox"
            className="size-5"
            checked={allVisible}
            disabled={visible.length === 0}
            ref={(input) => {
              if (input) input.indeterminate = someVisible;
            }}
            onChange={(event) => onToggleAll(visible, event.target.checked)}
          />
          {t("connections.picker.all")}
        </label>
        <span className="tabular-nums text-ink-muted">
          {enabledCount} {t("connections.picker.of")} {assets.length}
        </span>
      </div>
      {visible.length === 0 && (
        <p className="text-ink-muted">{t("connections.picker.noMatches")}</p>
      )}
      <ul className="flex flex-col">
        {visible.map((asset) => (
          <li key={asset.id}>
            <label className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                className="size-5"
                checked={isEnabled(asset, draft)}
                onChange={(event) => onToggle(asset, event.target.checked)}
              />
              <span>{asset.name}</span>
              <span className="text-ink-subtle tabular-nums">
                {asset.metaId}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
