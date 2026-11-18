import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { Combobox } from "../../components/Combobox";
import { EmptyState } from "../../components/EmptyState";
import { accountHealth } from "../../features/launch/account-health";
import { assetOptions } from "../../features/launch/asset-options";
import type { StepProps } from "../../features/launch/step-types";
import { useMetaAssets } from "../../features/launch/use-meta-assets";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";

const NO_INSTAGRAM = "";

export function Step1Account({
  workspaceId,
  draft,
  update,
  setBlockReason,
}: StepProps) {
  const navigate = useNavigate();
  const assets = useMetaAssets(workspaceId);
  const all = assets.data ?? [];
  const accountOptions = assetOptions(all, "ad_account");
  const account = all.find(
    ({ kind, id }) => kind === "ad_account" && id === draft.adAccountAssetId,
  );
  const page = all.find(
    ({ kind, metaId }) => kind === "page" && metaId === draft.pageId,
  );
  const health = account && accountHealth(account);
  const blockReason = health?.blockReason ? t(health.blockReason) : null;

  useEffect(() => {
    setBlockReason(blockReason);
    return () => setBlockReason(null);
  }, [blockReason, setBlockReason]);

  const comboboxState = {
    loading: assets.isPending,
    loadError: assets.isError ? t("combobox.error") : undefined,
    onRetry: () => void assets.refetch(),
  };

  if (assets.isSuccess && accountOptions.length === 0)
    return (
      <EmptyState
        message={t("launcher.account.noAccounts")}
        action={
          <Button
            onClick={() =>
              navigate(workspacePath(workspaceId, "ajustes/conexiones"))
            }
          >
            {t("launcher.account.connect")}
          </Button>
        }
      />
    );

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <Combobox
        {...comboboxState}
        label={t("launcher.account.accountLabel")}
        required
        options={accountOptions}
        value={draft.adAccountAssetId ?? null}
        onChange={(adAccountAssetId) =>
          update({ adAccountAssetId, pixelId: undefined })
        }
      />
      {health && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2">
            <span className="text-ink-muted">
              {t("launcher.account.healthLabel")}
            </span>
            <StatusChip tone={health.tone}>{t(health.label)}</StatusChip>
          </p>
          {blockReason && (
            <p
              role="alert"
              className="rounded-sm border border-loss bg-loss-soft p-3 text-loss"
            >
              {blockReason}
            </p>
          )}
        </div>
      )}
      <Combobox
        {...comboboxState}
        label={t("launcher.account.pageLabel")}
        required
        options={assetOptions(all, "page")}
        value={draft.pageId ?? null}
        onChange={(pageId) => update({ pageId, instagramUserId: undefined })}
      />
      <Combobox
        {...comboboxState}
        label={t("launcher.account.instagramLabel")}
        hint={t("launcher.account.instagramHint")}
        options={[
          { value: NO_INSTAGRAM, label: t("launcher.account.instagramNone") },
          ...(page ? assetOptions(all, "instagram", page.metaId) : []),
        ]}
        value={draft.instagramUserId ?? NO_INSTAGRAM}
        onChange={(instagramUserId) =>
          update({ instagramUserId: instagramUserId || undefined })
        }
      />
      <Combobox
        {...comboboxState}
        label={t("launcher.account.pixelLabel")}
        required
        options={account ? assetOptions(all, "pixel", account.metaId) : []}
        value={draft.pixelId ?? null}
        onChange={(pixelId) => update({ pixelId })}
      />
    </div>
  );
}
