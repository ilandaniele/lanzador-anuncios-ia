import type {
  GoogleConnectionResponse,
  PickerTokenResponse,
} from "../../../shared/schemas/google";
import type { Env } from "../../env";
import { GoogleError } from "../../integrations/google/client";
import {
  type GoogleAccessToken,
  refreshAccessToken,
  revokeToken,
} from "../../integrations/google/oauth";
import { AppError, conflict, notFound } from "../../lib/errors";
import { logEvent } from "../../lib/logger";
import { now } from "../../lib/time";
import { aadFor, decryptToken } from "../../lib/token-crypto";
import {
  deleteGoogleConnection,
  findGoogleConnection,
  findGoogleConnectionSecret,
  type GoogleConnectionSecret,
  setGoogleReconnectRequired,
} from "../../repositories/google-connections";
import type { Scope } from "../../repositories/scope";
import { manualAuditEntry } from "../audit-entry";

const GOOGLE_CONNECTIONS_TABLE = "google_connections";

export const googleTokenAad = (scope: Scope, connectionId: string) =>
  aadFor(
    GOOGLE_CONNECTIONS_TABLE,
    `${connectionId}:${scope.userId}`,
    scope.workspaceId,
  );

type TokenEnv = Pick<
  Env,
  | "APP_ORIGIN"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "TOKEN_ENC_KEY_CURRENT"
>;

const decryptRefreshToken = (
  env: TokenEnv,
  scope: Scope,
  connection: GoogleConnectionSecret,
) =>
  decryptToken(
    env,
    {
      ciphertext: new Uint8Array(connection.refreshTokenCiphertext),
      iv: new Uint8Array(connection.refreshTokenIv),
      keyVersion: connection.tokenKeyVersion,
    },
    googleTokenAad(scope, connection.id),
  );

export async function getGoogleConnection(
  db: D1Database,
  scope: Scope,
): Promise<GoogleConnectionResponse> {
  const row = await findGoogleConnection(db, scope);
  return {
    connected: row !== null,
    email: row?.email ?? null,
    status: row?.status ?? null,
  };
}

export async function googleAccessTokenFor(
  env: TokenEnv & Pick<Env, "DB">,
  scope: Scope,
): Promise<GoogleAccessToken> {
  const connection = await findGoogleConnectionSecret(env.DB, scope);
  if (connection?.status !== "active") {
    throw conflict("GOOGLE_RECONNECT_REQUIRED");
  }
  const refreshToken = await decryptRefreshToken(env, scope, connection);
  try {
    return await refreshAccessToken(env, refreshToken, now());
  } catch (error) {
    if (error instanceof GoogleError && error.code === "invalid_grant") {
      await setGoogleReconnectRequired(env.DB, scope, connection.id, now());
      throw conflict("GOOGLE_RECONNECT_REQUIRED");
    }
    logEvent("warn", "google.refresh_failed", {
      connectionId: connection.id,
      status: error instanceof GoogleError ? error.status : undefined,
      code: error instanceof GoogleError ? error.code : undefined,
    });
    throw new AppError(502, "GOOGLE_ERROR");
  }
}

export async function pickerToken(
  env: Env,
  scope: Scope,
): Promise<PickerTokenResponse> {
  const { accessToken, expiresAt } = await googleAccessTokenFor(env, scope);
  return {
    accessToken,
    expiresAt: new Date(expiresAt).toISOString(),
    apiKey: env.GOOGLE_PICKER_API_KEY,
    appId: env.GOOGLE_PROJECT_NUMBER,
  };
}

async function revokeAtGoogle(
  env: TokenEnv,
  scope: Scope,
  connection: GoogleConnectionSecret,
): Promise<boolean> {
  try {
    return await revokeToken(await decryptRefreshToken(env, scope, connection));
  } catch (error) {
    logEvent("warn", "google.revoke_failed", {
      connectionId: connection.id,
      workspaceId: scope.workspaceId,
      name: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function disconnectGoogle(
  env: Env,
  scope: Scope,
  requestId: string,
): Promise<void> {
  const connection = await findGoogleConnectionSecret(env.DB, scope);
  if (!connection) throw notFound();
  const revoked = await revokeAtGoogle(env, scope, connection);
  await deleteGoogleConnection(
    env.DB,
    scope,
    connection.id,
    manualAuditEntry(scope, requestId, {
      action: "google.connection.disconnect",
      objectType: "google_connection",
      detail: { connectionId: connection.id, revoked },
    }),
  );
}
