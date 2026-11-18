import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";
import { budgetExhaustedReason } from "../ai/budget-reason";

export const isSessionClosed = (error: unknown) =>
  error instanceof ApiError && error.code === "SESSION_CLOSED";

export function chatErrorMessage(error: unknown): string {
  const budget = budgetExhaustedReason(error);
  if (budget) return budget;
  if (isSessionClosed(error)) return t("chat.sessionClosed");
  if (error instanceof ApiError && error.code === "RATE_LIMITED")
    return t("chat.rateLimited");
  return t("chat.failed");
}
