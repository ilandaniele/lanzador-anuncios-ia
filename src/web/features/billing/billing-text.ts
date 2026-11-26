import { trialDaysLeft } from "../../../shared/billing";
import type { ErrorCode } from "../../../shared/errors";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const MESSAGE_KEYS: Partial<Record<ErrorCode, TextKey>> = {
  SUBSCRIPTION_ACTIVE: "billing.alreadyActive",
};

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "long" });

export const fillText = (
  template: string,
  values: Record<string, string | number>,
) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

export const formatBillingDate = (isoDate: string) =>
  dateFormat.format(new Date(isoDate));

export function billingErrorMessage(error: unknown): string {
  const key = error instanceof ApiError ? MESSAGE_KEYS[error.code] : undefined;
  return t(key ?? "billing.error");
}

export function trialMessage(trialEndsAt: string, nowMs = Date.now()): string {
  const days = trialDaysLeft(Date.parse(trialEndsAt), nowMs);
  return days > 0
    ? fillText(t("billing.trialDaysLeft"), { days })
    : t("billing.trialEnded");
}
