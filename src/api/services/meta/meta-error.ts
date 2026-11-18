import { MetaError } from "../../integrations/meta/client";
import { AppError, conflict } from "../../lib/errors";

export function rethrowMetaError(error: unknown): never {
  if (!(error instanceof MetaError)) throw error;
  if (error.kind === "session") throw conflict("META_RECONNECT_REQUIRED");
  throw new AppError(502, "META_ERROR");
}
