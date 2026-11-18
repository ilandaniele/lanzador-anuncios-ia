import type { CreativeKind } from "../../../shared/schemas/creatives";
import type { DriveImportRequest } from "../../../shared/schemas/google";
import { UPLOAD_CONTENT_TYPES } from "../../../shared/schemas/uploads";
import type { PickerDocument } from "./picker";

export type DriveFile = DriveImportRequest["files"][number];

export interface ImportedFile {
  creativeId: string;
  name: string;
  kind: CreativeKind;
}

export function toDriveFiles(documents: PickerDocument[]): DriveFile[] {
  return documents.flatMap(({ id, name, mimeType, sizeBytes }) =>
    UPLOAD_CONTENT_TYPES.has(mimeType) && sizeBytes
      ? [{ id, name, mimeType, sizeBytes }]
      : [],
  );
}

export function toImportedFiles(
  files: DriveFile[],
  creativeIds: string[],
): ImportedFile[] {
  return files.flatMap((file, index) => {
    const creativeId = creativeIds[index];
    const kind = UPLOAD_CONTENT_TYPES.get(file.mimeType);
    return creativeId && kind ? [{ creativeId, name: file.name, kind }] : [];
  });
}
