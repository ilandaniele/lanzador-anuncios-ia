import { useState } from "react";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";
import { isMetaInProgressStatus } from "../uploads/upload-item";
import type { ImportedFile } from "./drive-files";
import { googleErrorMessage } from "./google-errors";
import { parseDriveFolderId } from "./folder-link";
import { useDriveImport } from "./use-drive-import";

type DriveImporterProps = {
  workspaceId: string;
  adAccountAssetId: string;
  folderHint: string;
  creatives: Map<string, CreativeDto>;
  onImported: (files: ImportedFile[]) => void;
};

export function DriveImporter({
  workspaceId,
  adAccountAssetId,
  folderHint,
  creatives,
  onImported,
}: DriveImporterProps) {
  const [folderLink, setFolderLink] = useState(folderHint);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const driveImport = useDriveImport(workspaceId, adAccountAssetId);
  const folderId = parseDriveFolderId(folderLink);
  const unknownFolder = folderLink.trim() !== "" && folderId === null;
  const inProgress = [...importedIds].filter((id) => {
    const creative = creatives.get(id);
    return creative && isMetaInProgressStatus(creative.status);
  }).length;

  const choose = () =>
    driveImport.mutate(folderId, {
      onSuccess: (files) => {
        setImportedIds(
          (current) =>
            new Set([...current, ...files.map(({ creativeId }) => creativeId)]),
        );
        onImported(files);
      },
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="w-full">
        <Input
          label={t("launcher.step4.driveFolderLabel")}
          hint={t("launcher.step4.driveFolderHint")}
          error={
            unknownFolder ? t("launcher.step4.driveFolderUnknown") : undefined
          }
          value={folderLink}
          onChange={(event) => setFolderLink(event.target.value)}
        />
      </div>
      <Button
        loading={driveImport.isPending}
        loadingLabel={t("common.working")}
        onClick={choose}
      >
        {t("launcher.step4.driveChoose")}
      </Button>
      {driveImport.isError && (
        <p role="alert" className="text-loss">
          {googleErrorMessage(driveImport.error)}
        </p>
      )}
      <p role="status" className="text-ink-muted">
        {inProgress > 0 &&
          `${t("launcher.step4.driveImporting")}: ${inProgress} ${t("launcher.step4.driveImportingCount")}`}
      </p>
    </div>
  );
}
