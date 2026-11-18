import { useEffect, useState } from "react";
import { LAUNCH_MODES } from "../../../shared/constants";
import { nameValuesAt } from "../../../shared/name-templates";
import type { LaunchMode } from "../../../shared/schemas/launch";
import type { Settings } from "../../../shared/schemas/workspaces";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import {
  CampaignReference,
  referenceErrorText,
} from "../../features/launch/CampaignReference";
import { NameTemplateField } from "../../features/launch/NameTemplateField";
import type { StepProps } from "../../features/launch/step-types";
import {
  useCampaignReference,
  useCampaigns,
} from "../../features/launch/use-campaigns";
import { useProduct } from "../../features/products/use-products";
import { useWorkspaceOverview } from "../../features/settings/use-workspace-settings";
import { t, type TextKey } from "../../i18n/es-AR";

const MODE_TEXT = {
  new_cbo: {
    label: "launcher.step2.newCbo",
    hint: "launcher.step2.newCboHint",
  },
  existing_cbo: {
    label: "launcher.step2.existingCbo",
    hint: "launcher.step2.existingCboHint",
  },
} as const satisfies Record<LaunchMode, { label: TextKey; hint: TextKey }>;

type StructureFormProps = StepProps & { settings: Settings };

function StructureForm({
  workspaceId,
  draft,
  update,
  setBlockReason,
  settings,
}: StructureFormProps) {
  const [now] = useState(Date.now);
  const accountId = draft.adAccountAssetId ?? "";
  const campaignId = draft.existingCampaignId ?? "";
  const isExisting = draft.mode === "existing_cbo";
  const campaigns = useCampaigns(workspaceId, isExisting ? accountId : "");
  const reference = useCampaignReference(
    workspaceId,
    isExisting ? accountId : "",
    campaignId,
  );
  const product = useProduct(workspaceId, draft.productId ?? "");
  const blockReason =
    isExisting && reference.error ? referenceErrorText(reference.error) : null;

  useEffect(() => {
    setBlockReason(blockReason);
    return () => setBlockReason(null);
  }, [blockReason, setBlockReason]);

  const nameValues = nameValuesAt(
    now,
    settings.timezone,
    product.data?.name ?? t("launcher.step2.productFallback"),
    isExisting ? (reference.data?.nextAdsetNumber ?? 1) : 1,
  );
  const campaignList = campaigns.data?.data ?? [];

  function chooseMode(mode: LaunchMode) {
    if (mode === draft.mode) return;
    update({
      mode,
      existingCampaignId: undefined,
      campaignName:
        mode === "new_cbo" ? settings.nameTemplates.campaign : undefined,
      adsetName: draft.adsetName ?? settings.nameTemplates.adset,
    });
  }

  function chooseCampaign(id: string) {
    const campaign = campaignList.find((candidate) => candidate.id === id);
    update({ existingCampaignId: id, campaignName: campaign?.name });
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">
          {t("launcher.step2.modeLabel")}
        </legend>
        {LAUNCH_MODES.map((mode) => (
          <label
            key={mode}
            className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-sm border border-rule-strong bg-surface p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
          >
            <input
              type="radio"
              name="launch-mode"
              className="mt-1"
              checked={draft.mode === mode}
              onChange={() => chooseMode(mode)}
            />
            <span className="font-medium">{t(MODE_TEXT[mode].label)}</span>
            <span className="col-start-2 text-ink-muted">
              {t(MODE_TEXT[mode].hint)}
            </span>
          </label>
        ))}
      </fieldset>
      {isExisting && (
        <>
          <Combobox
            label={t("launcher.step2.campaignLabel")}
            required
            emptyText={t("launcher.step2.noCampaigns")}
            loading={campaigns.isPending}
            loadError={campaigns.isError ? t("combobox.error") : undefined}
            onRetry={() => void campaigns.refetch()}
            options={campaignList.map(({ id, name, effectiveStatus }) => ({
              value: id,
              label: name,
              description: effectiveStatus,
            }))}
            value={draft.existingCampaignId ?? null}
            onChange={chooseCampaign}
          />
          {campaigns.data?.truncated && (
            <p role="status" className="text-warn">
              {t("launcher.step2.campaignsTruncated")}
            </p>
          )}
          {reference.isPending && reference.fetchStatus !== "idle" && (
            <SkeletonRegion label={t("launcher.step2.referenceLoading")}>
              <Skeleton className="h-16" />
            </SkeletonRegion>
          )}
          {blockReason && (
            <p
              role="alert"
              className="rounded-sm border border-loss bg-loss-soft p-3 text-loss"
            >
              {blockReason}
            </p>
          )}
          {reference.data && <CampaignReference reference={reference.data} />}
        </>
      )}
      {draft.mode && (
        <>
          {!isExisting && (
            <NameTemplateField
              label={t("launcher.step2.campaignNameLabel")}
              value={draft.campaignName ?? ""}
              values={nameValues}
              onChange={(campaignName) => update({ campaignName })}
            />
          )}
          <NameTemplateField
            label={t("launcher.step2.adsetNameLabel")}
            value={draft.adsetName ?? ""}
            values={nameValues}
            onChange={(adsetName) => update({ adsetName })}
          />
        </>
      )}
    </div>
  );
}

export function Step2Structure(props: StepProps) {
  const overview = useWorkspaceOverview(props.workspaceId);

  if (overview.isPending)
    return (
      <SkeletonRegion label={t("common.loading")} className="max-w-[720px]">
        <Skeleton className="h-24" />
      </SkeletonRegion>
    );
  if (overview.isError)
    return (
      <div role="alert" className="flex items-center gap-2">
        <p className="text-loss">{t("launcher.step2.settingsFailed")}</p>
        <Button variant="ghost" onClick={() => void overview.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  return <StructureForm {...props} settings={overview.data.settings} />;
}
