import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const dayMonth = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  timeZone: "UTC",
});

export function budgetExhaustedReason(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== "AI_BUDGET_EXHAUSTED")
    return null;
  const { scope, resetsAt } = error.details ?? {};
  if (scope === "workspace_day") return t("copys.budget.day");
  if (scope === "workspace_month")
    return `${t("copys.budget.month")} ${dayMonth.format(new Date(String(resetsAt)))}.`;
  return t("copys.budget.global");
}
