import { useMutation } from "@tanstack/react-query";
import type {
  DriveImportResponse,
  PickerTokenResponse,
} from "../../../shared/schemas/google";
import { apiFetch } from "../../lib/api";
import {
  toDriveFiles,
  toImportedFiles,
  type ImportedFile,
} from "./drive-files";
import { loadPickerApi, pickDriveFiles } from "./picker";
import { googleApi } from "./use-google-connection";

async function pickAndImport(
  workspaceId: string,
  adAccountAssetId: string,
  folderId: string | null,
): Promise<ImportedFile[]> {
  const [credentials] = await Promise.all([
    apiFetch<PickerTokenResponse>(`${googleApi(workspaceId)}/picker-token`),
    loadPickerApi(),
  ]);
  const files = toDriveFiles(await pickDriveFiles(credentials, folderId));
  if (files.length === 0) return [];
  const { data } = await apiFetch<DriveImportResponse>(
    `${googleApi(workspaceId)}/imports`,
    { method: "POST", body: { adAccountAssetId, files } },
  );
  return toImportedFiles(
    files,
    data.map(({ creativeId }) => creativeId),
  );
}

export const useDriveImport = (workspaceId: string, adAccountAssetId: string) =>
  useMutation({
    mutationFn: (folderId: string | null) =>
      pickAndImport(workspaceId, adAccountAssetId, folderId),
  });
