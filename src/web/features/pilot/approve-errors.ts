import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

export function approveErrorMessage(error: unknown): string {
  const isBudgetCap = error instanceof ApiError && error.code === "BUDGET_CAP";
  return t(isBudgetCap ? "pilot.errorBudgetCap" : "errors.generic");
}

export const isStaleError = (error: unknown) =>
  error instanceof ApiError && error.code === "PROPOSAL_STALE";
