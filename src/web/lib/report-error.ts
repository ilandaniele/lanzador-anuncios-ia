import {
  clientErrorRequestSchema,
  type ClientErrorRequest,
} from "../../shared/schemas/client-errors";
import { apiFetch } from "./api";

const MAX_REPORTS_PER_SESSION = 20;
const UNKNOWN_MESSAGE = "Unknown error";
const { message: messageField, stack: stackField } =
  clientErrorRequestSchema.shape;
const MESSAGE_MAX = messageField.maxLength ?? Infinity;
const STACK_MAX = stackField.unwrap().maxLength ?? Infinity;

const reported = new Set<string>();

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error)
    return { message: error.message || error.name, stack: error.stack };
  return { message: String(error) };
}

function toRequest(error: unknown): ClientErrorRequest {
  const { message, stack } = describe(error);
  return {
    message: (message || UNKNOWN_MESSAGE).slice(0, MESSAGE_MAX),
    stack: stack?.slice(0, STACK_MAX),
    route: window.location.pathname,
  };
}

export function reportError(error: unknown): void {
  const request = toRequest(error);
  const key = `${request.message}\n${request.stack ?? ""}`;
  if (reported.has(key) || reported.size >= MAX_REPORTS_PER_SESSION) return;
  reported.add(key);
  apiFetch("/api/client-errors", { method: "POST", body: request }).catch(
    () => undefined,
  );
}

export function installGlobalErrorReporting(): () => void {
  const onError = (event: ErrorEvent) =>
    reportError(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) =>
    reportError(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
