import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../../api/env";
import { GoogleError } from "../../api/integrations/google/client";
import {
  readDriveMetadata,
  readDriveRange,
} from "../../api/integrations/google/drive";
import type { GoogleAccessToken } from "../../api/integrations/google/oauth";
import { MetaError } from "../../api/integrations/meta/errors";
import { AppError } from "../../api/lib/errors";
import { now } from "../../api/lib/time";
import type { Scope } from "../../api/repositories/scope";
import { googleAccessTokenFor } from "../../api/services/google/connection";
import { allowedFileKind } from "../../api/services/uploads";
import type { CreativeKind } from "../../shared/schemas/creatives";

const TOKEN_MARGIN_MS = 60_000;

export const DRIVE_NO_ACCESS = "DRIVE_NO_ACCESS";
export const DRIVE_RECONNECT = "DRIVE_RECONNECT";
export const DRIVE_FILE_CHANGED = "DRIVE_FILE_CHANGED";
export const DRIVE_CREATOR_REMOVED = "DRIVE_CREATOR_REMOVED";

const NO_ACCESS_STATUSES = new Set([403, 404]);

const FAILURE_MESSAGES: Record<string, string> = {
  [DRIVE_NO_ACCESS]:
    "No tengo acceso a este archivo de Drive. Compartilo con la cuenta conectada y volvé a importarlo.",
  [DRIVE_RECONNECT]:
    "Google Drive se desconectó. Reconectalo y volvé a importar el archivo.",
  [DRIVE_FILE_CHANGED]:
    "El archivo de Drive no coincide con el elegido o supera los límites. Volvé a importarlo.",
  [DRIVE_CREATOR_REMOVED]:
    "Quien inició la importación ya no puede editar este espacio de trabajo.",
};
const META_FAILURE = "No pude subir el archivo a Meta.";
const DOWNLOAD_FAILURE = "No pude bajar el archivo de Drive.";

function toStepError(error: unknown): unknown {
  if (error instanceof AppError && error.code === "GOOGLE_RECONNECT_REQUIRED") {
    return new NonRetryableError(DRIVE_RECONNECT);
  }
  if (!(error instanceof GoogleError)) return error;
  if (error.status === 401) return new NonRetryableError(DRIVE_RECONNECT);
  if (NO_ACCESS_STATUSES.has(error.status)) {
    return new NonRetryableError(DRIVE_NO_ACCESS);
  }
  return error;
}

async function withStepErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toStepError(error);
  }
}

function cachedAccessToken(env: Env, scope: Scope) {
  let token: GoogleAccessToken | null = null;
  return async () => {
    if (!token || token.expiresAt - TOKEN_MARGIN_MS <= now()) {
      token = await googleAccessTokenFor(env, scope);
    }
    return token.accessToken;
  };
}

export function driveRangeReader(
  env: Env,
  scope: Scope,
  fileId: string,
): (start: number, end: number) => Promise<ReadableStream> {
  const accessToken = cachedAccessToken(env, scope);
  return (start, end) =>
    withStepErrors(async () =>
      readDriveRange(await accessToken(), fileId, start, end),
    );
}

function kindOrNull(mimeType: string, sizeBytes: number): CreativeKind | null {
  try {
    return allowedFileKind(mimeType, sizeBytes);
  } catch {
    return null;
  }
}

export async function assertDriveFileMatches(
  env: Env,
  scope: Scope,
  fileId: string,
  expected: { kind: CreativeKind; sizeBytes: number },
): Promise<void> {
  const { size, mimeType } = await withStepErrors(async () =>
    readDriveMetadata(
      (await googleAccessTokenFor(env, scope)).accessToken,
      fileId,
    ),
  );
  const matches =
    size === expected.sizeBytes && kindOrNull(mimeType, size) === expected.kind;
  if (!matches) throw new NonRetryableError(DRIVE_FILE_CHANGED);
}

export const needsGoogleReconnect = (error: unknown) =>
  error instanceof Error && error.message === DRIVE_RECONNECT;

const isMetaFailure = (error: unknown) =>
  error instanceof MetaError ||
  (error instanceof AppError && error.code !== "GOOGLE_ERROR");

export const isUserFacingFailure = (error: unknown): error is Error =>
  error instanceof Error && Object.hasOwn(FAILURE_MESSAGES, error.message);

export function driveFailureMessage(error: unknown): string {
  if (isMetaFailure(error)) return META_FAILURE;
  if (isUserFacingFailure(error)) {
    return FAILURE_MESSAGES[error.message]!;
  }
  return DOWNLOAD_FAILURE;
}
