import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { DriveTab } from "../../features/google/DriveTab";
import type { ImportedFile } from "../../features/google/drive-files";
import { creativeState } from "../../features/launch/creative-state";
import { CopyFromCampaign } from "../../features/launch/CopyFromCampaign";
import { creativesBlock } from "../../features/launch/creatives-completion";
import { CreativeList } from "../../features/launch/CreativeList";
import { CreativeTabs } from "../../features/launch/CreativeTabs";
import {
  hasCreative,
  itemFromCreative,
  type CreativeRef,
  mixesMediaKinds,
} from "../../features/launch/draft-items";
import type { StepProps } from "../../features/launch/step-types";
import { useDraftItems } from "../../features/launch/use-draft-items";
import { useWorkspaceOverview } from "../../features/settings/use-workspace-settings";
import { Dropzone } from "../../features/uploads/Dropzone";
import {
  browserEnvironment,
  type UploadEnvironment,
} from "../../features/uploads/upload-environment";
import { useCreativeStatuses } from "../../features/uploads/use-creative-statuses";
import { t } from "../../i18n/es-AR";

type Step4Props = StepProps & { environment?: UploadEnvironment };

type CreativesFormProps = Step4Props & {
  environment: UploadEnvironment;
  max: number;
};

function CreativesForm({
  workspaceId,
  draft,
  update,
  setBlockReason,
  environment,
  max,
}: CreativesFormProps) {
  const adAccountAssetId = draft.adAccountAssetId ?? null;
  const { items, changeItems } = useDraftItems({ draft, update });
  const [mixedMedia, setMixedMedia] = useState(false);
  const statuses = useCreativeStatuses(
    workspaceId,
    items.flatMap(({ creativeId }) => creativeId ?? []),
    environment.pollIntervalMs,
  );
  const creatives = useMemo(
    () =>
      new Map((statuses.data ?? []).map((creative) => [creative.id, creative])),
    [statuses.data],
  );
  const block = creativesBlock(
    items.length,
    max,
    items.flatMap(({ creativeId }) => {
      const creative = creativeId ? creatives.get(creativeId) : undefined;
      return creative ? creativeState(creative) : [];
    }),
  );
  const blockText = block?.text ?? null;

  useEffect(() => {
    setBlockReason(blockText);
    return () => setBlockReason(null);
  }, [blockText, setBlockReason]);

  function addCreative(creative: CreativeRef) {
    changeItems((current) => {
      if (hasCreative(current, creative.id)) return current;
      const mixes = mixesMediaKinds(current, creative.kind);
      setMixedMedia(mixes);
      return mixes ? current : [...current, itemFromCreative(creative)];
    });
  }

  const addImported = (files: ImportedFile[]) =>
    files.forEach(({ creativeId, name, kind }) =>
      addCreative({ id: creativeId, name, kind }),
    );

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <CreativeTabs
        panels={{
          upload: (
            <Dropzone
              workspaceId={workspaceId}
              adAccountAssetId={adAccountAssetId}
              environment={environment}
              onReady={addCreative}
            />
          ),
          copy: (
            <CopyFromCampaign
              workspaceId={workspaceId}
              adAccountAssetId={adAccountAssetId}
              items={items}
              changeItems={changeItems}
            />
          ),
          drive: (
            <DriveTab
              workspaceId={workspaceId}
              adAccountAssetId={adAccountAssetId}
              folderHint={draft.driveFolderHint}
              creatives={creatives}
              onImported={addImported}
            />
          ),
        }}
      />
      {mixedMedia && (
        <p role="alert" className="text-loss">
          {t("launcher.step4.mixedMedia")}
        </p>
      )}
      {block && (
        <p
          role={block.role}
          className={block.role === "alert" ? "text-loss" : "text-ink-muted"}
        >
          {block.text}
        </p>
      )}
      <CreativeList
        items={items}
        creatives={creatives}
        max={max}
        changeItems={changeItems}
      />
    </div>
  );
}

export function Step4Creatives({
  environment = browserEnvironment,
  ...props
}: Step4Props) {
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
        <p className="text-loss">{t("launcher.step4.settingsFailed")}</p>
        <Button variant="ghost" onClick={() => void overview.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  return (
    <CreativesForm
      {...props}
      environment={environment}
      max={overview.data.plan.limits.maxCreativesPerLaunch}
    />
  );
}
