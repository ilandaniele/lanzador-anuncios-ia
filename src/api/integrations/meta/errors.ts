import { scrub } from "../../lib/logger";
import { isRecord } from "./payload";

export type MetaErrorKind =
  "rate_limit" | "session" | "permission" | "param" | "transient";

export interface MetaErrorInit {
  kind: MetaErrorKind;
  code: number;
  subcode?: number;
  userTitle?: string;
  userMsg?: string;
  retryAfterMs?: number;
  message?: string;
}

export class MetaError extends Error {
  readonly kind: MetaErrorKind;
  readonly code: number;
  readonly subcode?: number;
  readonly userTitle?: string;
  readonly userMsg?: string;
  readonly retryAfterMs?: number;

  constructor(init: MetaErrorInit) {
    super(init.message ?? `Meta ${init.kind} error ${init.code}`);
    this.name = "MetaError";
    this.kind = init.kind;
    this.code = init.code;
    this.subcode = init.subcode;
    this.userTitle = init.userTitle;
    this.userMsg = init.userMsg;
    this.retryAfterMs = init.retryAfterMs;
  }
}

interface GraphErrorBody {
  message?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  error_user_title?: string;
  error_user_msg?: string;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const SESSION_SUBCODES = new Set([458, 460, 463, 467]);
const PARAM_FAMILIES = new Set([1487, 2446, 1885]);
const API_ACCESS_BLOCKED = /API access blocked/i;
const API_ACCESS_BLOCKED_CODE = 200;
const MAX_TEXT_LENGTH = 500;

const between = (value: number, min: number, max: number) =>
  value >= min && value <= max;

const isParamFamily = (value?: number) =>
  value !== undefined && PARAM_FAMILIES.has(Math.floor(value / 1000));

function kindOf(httpStatus: number, error: GraphErrorBody): MetaErrorKind {
  const code = error.code ?? httpStatus;
  const subcode = error.error_subcode;
  if (
    code === 190 ||
    (subcode !== undefined && SESSION_SUBCODES.has(subcode)) ||
    (code === API_ACCESS_BLOCKED_CODE &&
      API_ACCESS_BLOCKED.test(error.message ?? ""))
  ) {
    return "session";
  }
  if (
    RATE_LIMIT_CODES.has(code) ||
    between(code, 80000, 80014) ||
    error.is_transient === true
  ) {
    return "rate_limit";
  }
  if (code === 10 || between(code, 200, 299)) return "permission";
  if (code === 100 || isParamFamily(code) || isParamFamily(subcode)) {
    return "param";
  }
  return httpStatus >= 500 ? "transient" : "param";
}

const numberOrUndefined = (value: unknown) =>
  typeof value === "number" ? value : undefined;

const safeText = (value: unknown) =>
  typeof value === "string"
    ? scrub(value.slice(0, MAX_TEXT_LENGTH))
    : undefined;

function graphErrorBody(payload: unknown): GraphErrorBody {
  const error = isRecord(payload) ? payload.error : undefined;
  if (!isRecord(error)) return {};
  return {
    message: safeText(error.message),
    code: numberOrUndefined(error.code),
    error_subcode: numberOrUndefined(error.error_subcode),
    is_transient:
      typeof error.is_transient === "boolean" ? error.is_transient : undefined,
    error_user_title: safeText(error.error_user_title),
    error_user_msg: safeText(error.error_user_msg),
  };
}

export function classifyMetaError(
  httpStatus: number,
  payload: unknown,
  retryAfterMs?: number,
): MetaError {
  const error = graphErrorBody(payload);
  return new MetaError({
    kind: kindOf(httpStatus, error),
    code: error.code ?? httpStatus,
    subcode: error.error_subcode,
    userTitle: error.error_user_title,
    userMsg: error.error_user_msg,
    retryAfterMs,
    message: error.message,
  });
}

export function networkMetaError(cause: unknown): MetaError {
  const timedOut = cause instanceof Error && cause.name === "TimeoutError";
  return new MetaError({
    kind: "transient",
    code: 0,
    message: timedOut ? "Meta request timed out" : "Meta network error",
  });
}

export const invalidPayloadError = () =>
  new MetaError({
    kind: "transient",
    code: 0,
    message: "Meta returned an invalid payload",
  });
