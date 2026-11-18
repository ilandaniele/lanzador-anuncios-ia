import type { Env } from "../../env";
import { revokePermissions } from "../../integrations/meta/auth";
import { discoverAssets } from "../../integrations/meta/read";
import { notFound } from "../../lib/errors";
import { logEvent } from "../../lib/logger";
import { now } from "../../lib/time";
import { selectConnectionAssets } from "../../repositories/meta-assets";
import {
  type ConnectionSecret,
  deleteConnection,
  findConnectionSecret,
  saveConnectedAssets,
  selectConnections,
} from "../../repositories/meta-connections";
import type { Scope } from "../../repositories/scope";
import { manualAuditEntry } from "../audit-entry";
import { decryptConnectionToken, graphForStoredConnection } from "./connection";
import { toAssetDto, toConnectionDto } from "./dto";
import { rethrowMetaError } from "./meta-error";

export async function listConnections(db: D1Database, scope: Scope) {
  const rows = await selectConnections(db, scope);
  return { data: rows.map(toConnectionDto) };
}

async function findConnectionOrThrow(db: D1Database, scope: Scope, id: string) {
  const connection = await findConnectionSecret(db, scope, id);
  if (!connection) throw notFound();
  return connection;
}

export async function refreshConnectionAssets(
  env: Env,
  scope: Scope,
  id: string,
  requestId: string,
) {
  const connection = await findConnectionOrThrow(env.DB, scope, id);
  const graph = await graphForStoredConnection(env.DB, env, scope, connection);
  const { assets } = await discoverAssets(graph).catch(rethrowMetaError);
  await saveConnectedAssets(
    env.DB,
    scope,
    id,
    assets,
    manualAuditEntry(scope, requestId, {
      action: "meta.connection.refresh_assets",
      objectType: "meta_connection",
      objectName: connection.businessName ?? undefined,
      detail: { connectionId: id, assetCount: assets.length },
    }),
    now(),
  );
  const rows = await selectConnectionAssets(env.DB, scope, id);
  return { data: rows.map(toAssetDto) };
}

async function revokeAtMeta(
  env: Env,
  scope: Scope,
  connection: ConnectionSecret,
): Promise<boolean> {
  try {
    const token = await decryptConnectionToken(
      env,
      scope.workspaceId,
      connection,
    );
    return await revokePermissions(env, token);
  } catch (error) {
    logEvent("warn", "meta.revoke_failed", {
      connectionId: connection.id,
      workspaceId: scope.workspaceId,
      name: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function disconnectMeta(
  env: Env,
  scope: Scope,
  id: string,
  requestId: string,
): Promise<void> {
  const connection = await findConnectionOrThrow(env.DB, scope, id);
  const revoked = await revokeAtMeta(env, scope, connection);
  await deleteConnection(
    env.DB,
    scope,
    id,
    manualAuditEntry(scope, requestId, {
      action: "meta.connection.disconnect",
      objectType: "meta_connection",
      objectName: connection.businessName ?? undefined,
      detail: {
        connectionId: id,
        businessId: connection.metaBusinessId,
        revoked,
      },
    }),
  );
}
