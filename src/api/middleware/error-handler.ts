import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorEnvelope } from "../../shared/schemas/common";
import { AppError } from "../lib/errors";
import { sha256Hex } from "../lib/hash";
import { logEvent, scrub } from "../lib/logger";
import { insertErrorEvent } from "../repositories/error-events";
import type { AppEnv } from "../types";

const SERVER_ERROR_MESSAGE = "Algo salió mal. Probá de nuevo en unos minutos.";

const isClientError = (err: Error) =>
  err instanceof SyntaxError ||
  (err instanceof HTTPException && err.status < 500);

function toAppError(err: Error): AppError {
  if (err instanceof AppError) return err;
  if (isClientError(err)) return new AppError(400, "VALIDATION");
  return new AppError(500, "INTERNAL");
}

function buildEnvelope(appError: AppError, requestId: string): ErrorEnvelope {
  const { code, status, message, fields, details } = appError;
  if (status >= 500) {
    return { error: { code, message: SERVER_ERROR_MESSAGE, requestId } };
  }
  return { error: { code, message, requestId, fields, details } };
}

async function recordServerError(
  err: Error,
  appError: AppError,
  c: Context<AppEnv>,
): Promise<void> {
  const event = {
    requestId: c.get("requestId"),
    route: c.req.routePath,
    status: appError.status,
    code: appError.code,
    message: scrub(err.message),
  };

  try {
    logEvent("error", "request_failed", {
      ...event,
      method: c.req.method,
      stack: err.stack,
    });
    await insertErrorEvent(c.env.DB, {
      ...event,
      source: "api",
      stackHash: err.stack ? await sha256Hex(err.stack) : null,
      userId: c.get("user")?.id ?? null,
      workspaceId: c.get("scope")?.workspaceId ?? null,
    });
  } catch (recordError) {
    logEvent("error", "error_event_insert_failed", {
      requestId: event.requestId,
      message: String(recordError),
    });
  }
}

export async function errorHandler(
  err: Error,
  c: Context<AppEnv>,
): Promise<Response> {
  const appError = toAppError(err);
  if (appError.status >= 500) await recordServerError(err, appError, c);
  if (appError.retryAfterSec !== undefined) {
    c.header("Retry-After", String(appError.retryAfterSec));
  }
  return c.json(
    buildEnvelope(appError, c.get("requestId")),
    appError.status as ContentfulStatusCode,
  );
}
