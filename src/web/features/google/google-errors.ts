import {
  GOOGLE_CONNECT_FAILURES,
  type GoogleConnectFailure,
} from "../../../shared/schemas/google";
import type { ErrorCode } from "../../../shared/errors";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const MESSAGE_KEYS: Partial<Record<ErrorCode, TextKey>> = {
  RATE_LIMITED: "google.errorRateLimited",
  GOOGLE_RECONNECT_REQUIRED: "google.reconnectRequired",
};

export function googleErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return t("google.errorPicker");
  return t(MESSAGE_KEYS[error.code] ?? "errors.generic");
}

const FAILURE_KEYS: Record<GoogleConnectFailure, TextKey> = {
  STATE_INVALID: "google.failure.STATE_INVALID",
  GOOGLE_DENIED: "google.failure.GOOGLE_DENIED",
  TOKEN_EXCHANGE_FAILED: "google.failure.TOKEN_EXCHANGE_FAILED",
  MISSING_PERMISSIONS: "google.failure.MISSING_PERMISSIONS",
  INTERNAL: "google.failure.INTERNAL",
};

const isConnectFailure = (
  reason: string | null,
): reason is GoogleConnectFailure =>
  GOOGLE_CONNECT_FAILURES.some((failure) => failure === reason);

export const googleConnectFailureMessage = (reason: string | null) =>
  t(isConnectFailure(reason) ? FAILURE_KEYS[reason] : "google.connectFailed");
