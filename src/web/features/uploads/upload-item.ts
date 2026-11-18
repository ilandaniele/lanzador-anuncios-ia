import type {
  CreativeDto,
  CreativeKind,
  CreativeStatus,
} from "../../../shared/schemas/creatives";
import type { ChunkRetry } from "./upload-client";

export type UploadPhase =
  "queued" | "uploading" | "sheet" | "tagging" | "submitted" | "failed";

export type RowStatus =
  | "queued"
  | "uploading"
  | "sheet"
  | "tagging"
  | "processing"
  | "ready"
  | "error";

export interface UploadItem {
  key: string;
  file: File;
  kind: CreativeKind;
  phase: UploadPhase;
  uploadedBytes: number;
  retry: ChunkRetry | null;
  creative: CreativeDto | null;
  duplicate: boolean;
  error: string | null;
}

const META_IN_PROGRESS: CreativeStatus[] = ["importing", "processing"];

export const isMetaInProgressStatus = (status: CreativeStatus) =>
  META_IN_PROGRESS.includes(status);

export const isMetaInProgress = (item: UploadItem) =>
  item.creative !== null && isMetaInProgressStatus(item.creative.status);

export function rowStatus(item: UploadItem): RowStatus {
  if (item.phase === "failed") return "error";
  if (item.phase !== "submitted") return item.phase;
  if (isMetaInProgress(item)) return "processing";
  return item.creative?.status === "failed" ? "error" : "ready";
}

export function withLatestCreatives(
  items: UploadItem[],
  creatives: CreativeDto[] = [],
): UploadItem[] {
  const latest = new Map(creatives.map((creative) => [creative.id, creative]));
  return items.map((item) => {
    const creative = item.creative && latest.get(item.creative.id);
    return creative ? { ...item, creative } : item;
  });
}
