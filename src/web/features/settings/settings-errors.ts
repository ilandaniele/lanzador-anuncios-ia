import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

export function deleteWorkspaceErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "CONFIRM_MISMATCH"
    ? t("danger.errorConfirmMismatch")
    : t("errors.generic");
}
