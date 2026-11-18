import { ROLE_RANK } from "../../../shared/constants";
import type {
  GoogleConnectFailure,
  GoogleConnectResponse,
} from "../../../shared/schemas/google";
import {
  type MetaCallbackQuery as OAuthCallbackQuery,
  metaCallbackQuerySchema as oauthCallbackQuerySchema,
} from "../../../shared/schemas/meta-oauth";
import type { Env } from "../../env";
import { GoogleError } from "../../integrations/google/client";
import {
  DRIVE_FILE_SCOPE,
  exchangeCode,
  googleAuthorizeUrl,
} from "../../integrations/google/oauth";
import { notFound } from "../../lib/errors";
import { randomToken, sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { logEvent, scrub } from "../../lib/logger";
import { now } from "../../lib/time";
import { encryptToken } from "../../lib/token-crypto";
import { replaceGoogleConnection } from "../../repositories/google-connections";
import { findEditableLaunchDraft } from "../../repositories/launches";
import { findWorkspaceAccess } from "../../repositories/memberships";
import {
  consumeOAuthState,
  insertOAuthState,
} from "../../repositories/oauth-states";
import type { Scope } from "../../repositories/scope";
import { manualAuditEntry } from "../audit-entry";
import { googleTokenAad } from "./connection";

const STATE_TTL_MS = 10 * 60 * 1000;

class ConnectFailure extends Error {
  constructor(readonly reason: GoogleConnectFailure) {
    super(reason);
  }
}

type ClaimedState = { scope: Scope; launchId: string | null };

const failureQuery = (reason: GoogleConnectFailure) =>
  `google=error&motivo=${reason}`;

const untrustedFailurePath = (reason: GoogleConnectFailure) =>
  `/?${failureQuery(reason)}`;

const returnPath = ({ scope, launchId }: ClaimedState) => {
  const workspace = `/w/${encodeURIComponent(scope.workspaceId)}`;
  return launchId
    ? `${workspace}/lanzador/${encodeURIComponent(launchId)}`
    : `${workspace}/ajustes/conexiones`;
};

export async function startGoogleConnect(
  env: Env,
  scope: Scope,
  { launchId }: { launchId?: string },
): Promise<GoogleConnectResponse> {
  if (launchId && !(await findEditableLaunchDraft(env.DB, scope, launchId))) {
    throw notFound();
  }
  const state = randomToken(32);
  const at = now();
  await insertOAuthState(env.DB, {
    id: newId(),
    stateHash: await sha256Hex(state),
    provider: "google",
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    launchId: launchId ?? null,
    createdAt: at,
    expiresAt: at + STATE_TTL_MS,
  });
  return { authorizeUrl: googleAuthorizeUrl(env, state) };
}

async function claimState(
  db: D1Database,
  userId: string,
  state: string,
): Promise<ClaimedState | null> {
  const claimed = await consumeOAuthState(db, {
    stateHash: await sha256Hex(state),
    provider: "google",
    userId,
    at: now(),
  });
  if (!claimed) return null;
  const access = await findWorkspaceAccess(db, claimed.workspaceId, userId);
  const allowed =
    access?.status === "active" &&
    access.role !== null &&
    ROLE_RANK[access.role] >= ROLE_RANK.editor;
  if (!allowed) return null;
  return {
    scope: { workspaceId: claimed.workspaceId, userId, role: access.role! },
    launchId: claimed.launchId,
  };
}

async function exchangeOrFail(env: Env, code: string, requestId: string) {
  try {
    return await exchangeCode(env, code);
  } catch (error) {
    logEvent("warn", "google.token_exchange_failed", {
      requestId,
      status: error instanceof GoogleError ? error.status : undefined,
      code: error instanceof GoogleError ? error.code : undefined,
    });
    throw new ConnectFailure("TOKEN_EXCHANGE_FAILED");
  }
}

async function connectGoogle(
  env: Env,
  scope: Scope,
  query: OAuthCallbackQuery,
  requestId: string,
) {
  if (query.error || !query.code) throw new ConnectFailure("GOOGLE_DENIED");
  const grant = await exchangeOrFail(env, query.code, requestId);
  if (!grant.scopes.includes(DRIVE_FILE_SCOPE)) {
    throw new ConnectFailure("MISSING_PERMISSIONS");
  }
  const id = newId();
  const sealed = await encryptToken(
    env,
    grant.refreshToken,
    googleTokenAad(scope, id),
  );
  await replaceGoogleConnection(
    env.DB,
    scope,
    {
      id,
      googleEmail: grant.email,
      refreshTokenCiphertext: Buffer.from(sealed.ciphertext),
      refreshTokenIv: Buffer.from(sealed.iv),
      tokenKeyVersion: sealed.keyVersion,
      scopes: JSON.stringify(grant.scopes),
    },
    manualAuditEntry(scope, requestId, {
      action: "google.connection.connect",
      objectType: "google_connection",
      detail: { connectionId: id },
    }),
    now(),
  );
}

function failureReason(
  error: unknown,
  requestId: string,
): GoogleConnectFailure {
  if (error instanceof ConnectFailure) return error.reason;
  logEvent("error", "google.oauth_callback_failed", {
    requestId,
    message: scrub(error instanceof Error ? error.message : String(error)),
  });
  return "INTERNAL";
}

async function resolveCallback(
  env: Env,
  userId: string,
  rawQuery: Record<string, string>,
  requestId: string,
): Promise<string> {
  const query = oauthCallbackQuerySchema.safeParse(rawQuery);
  const state = query.success ? query.data.state : undefined;
  const claimed = state ? await claimState(env.DB, userId, state) : null;
  if (!query.success || !claimed) return untrustedFailurePath("STATE_INVALID");
  try {
    await connectGoogle(env, claimed.scope, query.data, requestId);
    return `${returnPath(claimed)}?google=ok`;
  } catch (error) {
    return `${returnPath(claimed)}?${failureQuery(failureReason(error, requestId))}`;
  }
}

export async function completeGoogleConnect(
  env: Env,
  userId: string,
  rawQuery: Record<string, string>,
  requestId: string,
): Promise<string> {
  try {
    return await resolveCallback(env, userId, rawQuery, requestId);
  } catch (error) {
    return untrustedFailurePath(failureReason(error, requestId));
  }
}
