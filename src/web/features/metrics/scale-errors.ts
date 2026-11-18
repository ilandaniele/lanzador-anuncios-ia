import type { ErrorCode } from "../../../shared/errors";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const MESSAGE_KEYS: Partial<Record<ErrorCode, TextKey>> = {
  BUDGET_CHANGED: "metrics.actions.errorBudgetChanged",
  SCALE_LIMIT: "metrics.actions.errorScaleLimit",
  BUDGET_CAP: "metrics.actions.errorBudgetCap",
  NOT_CBO: "metrics.actions.errorNotCbo",
};

export function scaleErrorMessage(error: unknown): string {
  const key = error instanceof ApiError ? MESSAGE_KEYS[error.code] : undefined;
  return t(key ?? "errors.generic");
}
