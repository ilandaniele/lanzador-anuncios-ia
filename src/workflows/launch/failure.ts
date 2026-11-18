import { MetaError } from "../../api/integrations/meta/errors";
import { AppError } from "../../api/lib/errors";
import type { LaunchFailure } from "../../api/repositories/launch-run";
import { ERROR_STATUS } from "../../shared/errors";

const isErrorCode = (value: string) => Object.hasOwn(ERROR_STATUS, value);

export const metaErrorMessage = (error: MetaError) =>
  error.userTitle && error.userMsg
    ? `${error.userTitle}: ${error.userMsg}`
    : (error.userMsg ?? error.message);

export function launchFailure(error: unknown): LaunchFailure {
  if (error instanceof MetaError) {
    return {
      errorCode:
        error.kind === "session" ? "META_RECONNECT_REQUIRED" : "META_ERROR",
      errorMessage: metaErrorMessage(error),
    };
  }
  if (error instanceof AppError) {
    return { errorCode: error.code, errorMessage: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return isErrorCode(message)
    ? { errorCode: message, errorMessage: message }
    : { errorCode: "INTERNAL", errorMessage: "INTERNAL" };
}
