import { ROLE_RANK } from "../../../shared/constants";
import {
  metaCallbackQuerySchema,
  type MetaCallbackQuery,
  type MetaConnectFailure,
  type MetaConnectResponse,
} from "../../../shared/schemas/meta-oauth";
import type { Env } from "../../env";
import {
  debugToken,
  exchangeCode,
  exchangeLongLived,
  metaAuthorizeUrl,
  type TokenInfo,
} from "../../integrations/meta/auth";
import { createGraph, MetaError } from "../../integrations/meta/client";
import { discoverAssets } from "../../integrations/meta/read";
import { randomToken, sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { logEvent, scrub } from "../../lib/logger";
import { now } from "../../lib/time";
import { aadFor, encryptToken } from "../../lib/token-crypto";
import { findWorkspaceAccess } from "../../repositories/memberships";
import {
  findConnectionIdByBusiness,
  type MetaConnectionWrite,
  saveConnectedAssets,
  upsertConnection,
} from "../../repositories/meta-connections";
import {
  consumeOAuthState,
  insertOAuthState,
} from "../../repositories/oauth-states";
import type { Scope } from "../../repositories/scope";
import { manualAuditEntry } from "../audit-entry";

const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_CONNECTION_ID = "pending";
const ACCEPTED_TOKEN_TYPES = ["USER", "SYSTEM_USER"];
const UPSERT_ATTEMPTS = 2;

export const REQUIRED_META_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "instagram_basic",
] as const;

class ConnectFailure extends Error {
  constructor(readonly reason: MetaConnectFailure) {
    super(reason);
  }
}

const failTokenStep = (step: string, requestId: string) => (error: unknown) => {
  logEvent("warn", "meta.token_step_failed", {
    requestId,
    step,
    name: error instanceof Error ? error.name : typeof error,
    kind: error instanceof MetaError ? error.kind : undefined,
  });
  throw new ConnectFailure("TOKEN_EXCHANGE_FAILED");
};

const failureQuery = (reason: MetaConnectFailure) =>
  `resultado=error&motivo=${reason}`;

const connectionsPath = (workspaceId: string) =>
  `/w/${encodeURIComponent(workspaceId)}/ajustes/conexiones`;

export const untrustedFailurePath = (reason: MetaConnectFailure) =>
  `/?${failureQuery(reason)}`;

export async function startMetaConnect(
  env: Env,
  scope: Scope,
): Promise<MetaConnectResponse> {
  const state = randomToken(32);
  const at = now();
  await insertOAuthState(env.DB, {
    id: newId(),
    stateHash: await sha256Hex(state),
    provider: "meta",
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    createdAt: at,
    expiresAt: at + STATE_TTL_MS,
  });
  return { authorizeUrl: metaAuthorizeUrl(env, state) };
}

async function claimState(
  db: D1Database,
  userId: string,
  state: string,
): Promise<Scope | null> {
  const claimed = await consumeOAuthState(db, {
    stateHash: await sha256Hex(state),
    provider: "meta",
    userId,
    at: now(),
  });
  if (!claimed) return null;
  const access = await findWorkspaceAccess(db, claimed.workspaceId, userId);
  const allowed =
    access?.status === "active" &&
    access.role !== null &&
    ROLE_RANK[access.role] >= ROLE_RANK.admin;
  return allowed
    ? { workspaceId: claimed.workspaceId, userId, role: access.role! }
    : null;
}

function assertIssuedToUs(env: Env, info: TokenInfo) {
  const usable =
    info.isValid &&
    info.appId === env.META_APP_ID &&
    ACCEPTED_TOKEN_TYPES.includes(info.type ?? "");
  if (!usable) throw new ConnectFailure("TOKEN_EXCHANGE_FAILED");
}

async function verifiedToken(env: Env, code: string, requestId: string) {
  let token = await exchangeCode(env, code).catch(
    failTokenStep("exchange_code", requestId),
  );
  let info = await debugToken(env, token).catch(
    failTokenStep("debug_token", requestId),
  );
  assertIssuedToUs(env, info);
  if (info.type === "USER") {
    token = await exchangeLongLived(env, token).catch(
      failTokenStep("exchange_long_lived", requestId),
    );
    info = await debugToken(env, token).catch(
      failTokenStep("debug_long_lived", requestId),
    );
    assertIssuedToUs(env, info);
  }
  if (REQUIRED_META_SCOPES.some((scope) => !info.scopes.includes(scope))) {
    throw new ConnectFailure("MISSING_PERMISSIONS");
  }
  return { token, info };
}

async function settleConnection(
  env: Env,
  scope: Scope,
  businessId: string,
  write: (id: string) => Promise<MetaConnectionWrite>,
): Promise<string> {
  const currentId = async () =>
    (await findConnectionIdByBusiness(env.DB, scope, businessId)) ?? newId();
  let id = await currentId();
  for (let attempt = 1; attempt <= UPSERT_ATTEMPTS; attempt++) {
    if (await upsertConnection(env.DB, scope, await write(id), now())) {
      return id;
    }
    id = await currentId();
  }
  throw new Error("meta connection row did not settle");
}

async function connectBusiness(
  env: Env,
  scope: Scope,
  query: MetaCallbackQuery,
  requestId: string,
) {
  if (query.error || !query.code) throw new ConnectFailure("META_DENIED");
  const { token, info } = await verifiedToken(env, query.code, requestId);
  const graph = createGraph(env, {
    token,
    connectionId: PENDING_CONNECTION_ID,
    workspaceId: scope.workspaceId,
  });
  const { user, businessId, businessName, assets } = await discoverAssets(
    graph,
    info.granularScopes,
  );
  if (!businessId) throw new ConnectFailure("MISSING_PERMISSIONS");

  const id = await settleConnection(
    env,
    scope,
    businessId,
    async (connectionId) => {
      const sealed = await encryptToken(
        env,
        token,
        aadFor("meta_connections", connectionId, scope.workspaceId),
      );
      return {
        id: connectionId,
        metaBusinessId: businessId,
        businessName,
        metaUserId: user.id,
        tokenType: info.type === "USER" ? "user" : "system_user",
        tokenCiphertext: Buffer.from(sealed.ciphertext),
        tokenIv: Buffer.from(sealed.iv),
        tokenKeyVersion: sealed.keyVersion,
        tokenExpiresAt: info.expiresAt,
        scopes: JSON.stringify(info.scopes),
      };
    },
  );
  await saveConnectedAssets(
    env.DB,
    scope,
    id,
    assets,
    manualAuditEntry(scope, requestId, {
      action: "meta.connection.connect",
      objectType: "meta_connection",
      objectName: businessName ?? undefined,
      detail: { connectionId: id, businessId, assetCount: assets.length },
    }),
    now(),
  );
}

function failureReason(error: unknown, requestId: string): MetaConnectFailure {
  if (error instanceof ConnectFailure) return error.reason;
  if (error instanceof MetaError) return "META_ERROR";
  logEvent("error", "meta.oauth_callback_failed", {
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
  const query = metaCallbackQuerySchema.safeParse(rawQuery);
  const state = query.success ? query.data.state : undefined;
  const scope = state ? await claimState(env.DB, userId, state) : null;
  if (!query.success || !scope) return untrustedFailurePath("STATE_INVALID");
  try {
    await connectBusiness(env, scope, query.data, requestId);
    return `${connectionsPath(scope.workspaceId)}?resultado=ok`;
  } catch (error) {
    const reason = failureReason(error, requestId);
    return `${connectionsPath(scope.workspaceId)}?${failureQuery(reason)}`;
  }
}

export async function completeMetaConnect(
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
