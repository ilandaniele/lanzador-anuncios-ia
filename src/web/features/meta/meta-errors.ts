import type { ErrorCode } from "../../../shared/errors";
import {
  META_CONNECT_FAILURES,
  type MetaConnectFailure,
} from "../../../shared/schemas/meta-oauth";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const MESSAGE_KEYS: Partial<Record<ErrorCode, TextKey>> = {
  PLAN_AD_ACCOUNT_LIMIT: "connections.errorPlanLimit",
  META_RECONNECT_REQUIRED: "connections.errorReconnectRequired",
  META_RATE_LIMITED: "connections.errorRateLimited",
  RATE_LIMITED: "connections.errorRateLimited",
  META_TESTER_REJECTED: "connections.errorTesterRejected",
  META_TESTER_ALREADY_REQUESTED: "connections.errorTesterAlreadyRequested",
};

export function metaErrorMessage(error: unknown): string {
  const key = error instanceof ApiError ? MESSAGE_KEYS[error.code] : undefined;
  return t(key ?? "errors.generic");
}

const FAILURE_KEYS: Record<MetaConnectFailure, TextKey> = {
  STATE_INVALID: "connections.failure.STATE_INVALID",
  META_DENIED: "connections.failure.META_DENIED",
  TOKEN_EXCHANGE_FAILED: "connections.failure.TOKEN_EXCHANGE_FAILED",
  MISSING_PERMISSIONS: "connections.failure.MISSING_PERMISSIONS",
  META_ERROR: "connections.failure.META_ERROR",
  INTERNAL: "connections.failure.INTERNAL",
};

const isConnectFailure = (
  reason: string | null,
): reason is MetaConnectFailure =>
  META_CONNECT_FAILURES.some((failure) => failure === reason);

export const connectFailureMessage = (reason: string | null) =>
  t(
    isConnectFailure(reason)
      ? FAILURE_KEYS[reason]
      : "connections.connectFailed",
  );
