import { useState } from "react";
import { ASSET_KINDS } from "../../../shared/constants";
import type { AssetDto } from "../../../shared/schemas/meta-connections";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { Input } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { AssetGroup } from "./AssetGroup";
import {
  GROUP_LABELS,
  matchesSearch,
  toChanges,
  withEnabled,
  type AssetDraft,
} from "./asset-groups";
import { metaErrorMessage } from "./meta-errors";
import { useAssets, usePatchAssets } from "./use-meta-connections";

type AssetPickerProps = { workspaceId: string };

export function AssetPicker({ workspaceId }: AssetPickerProps) {
  const assetsQuery = useAssets(workspaceId);
  const save = usePatchAssets(workspaceId);
  const { notify } = useToast();
  const [draft, setDraft] = useState<AssetDraft>({});
  const [search, setSearch] = useState("");
  const pending = toChanges(draft);

  const toggle = (assets: AssetDto[], enabled: boolean) =>
    setDraft((current) => withEnabled(current, assets, enabled));

  function handleSave() {
    save.mutate(pending, {
      onSuccess: () => {
        setDraft({});
        notify({ tone: "success", message: t("connections.picker.saved") });
      },
    });
  }

  if (assetsQuery.isPending)
    return (
      <SkeletonRegion
        label={t("common.loading")}
        className="flex flex-col gap-4"
      >
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </SkeletonRegion>
    );

  if (assetsQuery.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>{t("connections.picker.loadError")}</p>
        <Button variant="secondary" onClick={() => void assetsQuery.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  if (assetsQuery.data.length === 0)
    return <p className="text-ink-muted">{t("connections.picker.empty")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Input
        type="search"
        label={t("connections.picker.search")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {ASSET_KINDS.map((kind) => {
        const assets = assetsQuery.data.filter((asset) => asset.kind === kind);
        if (assets.length === 0) return null;
        return (
          <AssetGroup
            key={kind}
            title={t(GROUP_LABELS[kind])}
            assets={assets}
            visible={assets.filter((asset) => matchesSearch(asset, search))}
            draft={draft}
            onToggle={(asset, enabled) => toggle([asset], enabled)}
            onToggleAll={toggle}
          />
        );
      })}
      {save.isError && (
        <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
          {metaErrorMessage(save.error)}
        </p>
      )}
      {pending.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-rule bg-paper p-4">
          <Button
            loading={save.isPending}
            loadingLabel={t("common.working")}
            onClick={handleSave}
          >
            {t("connections.picker.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
