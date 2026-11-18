import type { ErrorCode } from "../../../shared/errors";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";
import type { FileRejection } from "./upload-client";

const REJECTION_KEYS: Record<FileRejection, TextKey> = {
  type: "uploads.notMedia",
  empty: "uploads.empty",
  videoSize: "uploads.videoTooLarge",
  imageSize: "uploads.imageTooLarge",
};

const ERROR_KEYS: Partial<Record<ErrorCode, TextKey>> = {
  FILE_TOO_LARGE: "uploads.errorTooLarge",
  UNSUPPORTED_TYPE: "uploads.errorType",
  UPLOAD_EXPIRED: "uploads.errorExpired",
  RATE_LIMITED: "uploads.errorRateLimited",
  META_RATE_LIMITED: "uploads.errorRateLimited",
};

export const rejectionMessage = (file: File, reason: FileRejection) =>
  `${file.name} ${t(REJECTION_KEYS[reason])}`;

export function uploadErrorMessage(error: unknown): string {
  const key = error instanceof ApiError ? ERROR_KEYS[error.code] : undefined;
  return t(key ?? "uploads.errorGeneric");
}
