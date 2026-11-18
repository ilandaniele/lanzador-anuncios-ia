import { useParams } from "react-router";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { Button } from "../../components/Button";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { DriveImporter } from "./DriveImporter";
import type { ImportedFile } from "./drive-files";
import { GoogleConnectPrompt } from "./GoogleConnectPrompt";
import { useGoogleConnection } from "./use-google-connection";

type DriveTabProps = {
  workspaceId: string;
  adAccountAssetId: string | null;
  folderHint?: string;
  creatives: Map<string, CreativeDto>;
  onImported: (files: ImportedFile[]) => void;
};

export function DriveTab({
  workspaceId,
  adAccountAssetId,
  folderHint = "",
  creatives,
  onImported,
}: DriveTabProps) {
  const { launchId } = useParams();
  const connection = useGoogleConnection(workspaceId);

  if (!adAccountAssetId)
    return (
      <p className="text-ink-muted">{t("launcher.step4.driveChooseAccount")}</p>
    );

  if (connection.isPending)
    return (
      <SkeletonRegion label={t("common.loading")}>
        <Skeleton className="h-10" />
      </SkeletonRegion>
    );

  if (connection.isError)
    return (
      <div role="alert" className="flex items-center gap-2">
        <p className="text-loss">{t("google.loadError")}</p>
        <Button variant="ghost" onClick={() => void connection.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );

  if (connection.data.status !== "active")
    return (
      <GoogleConnectPrompt
        workspaceId={workspaceId}
        reconnecting={connection.data.connected}
        launchId={launchId}
      />
    );

  return (
    <DriveImporter
      workspaceId={workspaceId}
      adAccountAssetId={adAccountAssetId}
      folderHint={folderHint}
      creatives={creatives}
      onImported={onImported}
    />
  );
}
