import type { AiBudgetScope } from "../../../shared/constants";
import type { AiUsage } from "../../../shared/schemas/workspaces";
import { t } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const dayMonth = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  timeZone: "UTC",
});

function scopeReason(scope: unknown, resetsAt: unknown): string {
  if (scope === "workspace_day") return t("copys.budget.day");
  if (scope === "workspace_month")
    return `${t("copys.budget.month")} ${dayMonth.format(new Date(String(resetsAt)))}.`;
  return t("copys.budget.global");
}

export function budgetExhaustedReason(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== "AI_BUDGET_EXHAUSTED")
    return null;
  const { scope, resetsAt } = error.details ?? {};
  return scopeReason(scope, resetsAt);
}

function nextMonthStart(isoDate: string): string {
  const date = new Date(isoDate);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  ).toISOString();
}

function exhaustedScope(usage: AiUsage): AiBudgetScope | null {
  if (usage.globalExhausted) return "global_day";
  if (usage.neuronsToday >= usage.dailyCap) return "workspace_day";
  if (usage.neuronsMonth >= usage.monthlyCap) return "workspace_month";
  return null;
}

export function aiUsageReason(usage: AiUsage | undefined): string | null {
  const scope = usage && exhaustedScope(usage);
  if (!usage || !scope) return null;
  return scopeReason(
    scope,
    scope === "workspace_month"
      ? nextMonthStart(usage.resetsAt)
      : usage.resetsAt,
  );
}
