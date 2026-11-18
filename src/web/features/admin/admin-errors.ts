import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

export function inviteErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "ALREADY_INVITED"
    ? t("admin.errorAlreadyInvited")
    : t("errors.generic");
}

export function restoreErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "INVALID_STATUS"
    ? t("admin.errorRestoreExpired")
    : t("errors.generic");
}
