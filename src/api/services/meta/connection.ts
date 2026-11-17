import type { Env } from "../../env";
import { conflict, notFound } from "../../lib/errors";
import { now } from "../../lib/time";
import { aadFor, decryptToken } from "../../lib/token-crypto";
import {
  createGraph,
  type GraphConnection,
} from "../../integrations/meta/client";
import { findEnabledAdAccount } from "../../repositories/meta-assets";
import { setConnectionReconnectRequired } from "../../repositories/meta-connections";
import type { Scope } from "../../repositories/scope";

type ConnectionEnv = Pick<
  Env,
  "GRAPH_API_VERSION" | "META_APP_SECRET" | "TOKEN_ENC_KEY_CURRENT"
>;

export function markReconnectRequired(
  db: D1Database,
  workspaceId: string,
  connectionId: string,
  code: number,
): Promise<void> {
  return setConnectionReconnectRequired(
    db,
    workspaceId,
    connectionId,
    code,
    now(),
  );
}

export function graphForConnection(
  db: D1Database,
  env: ConnectionEnv,
  conn: GraphConnection,
) {
  return createGraph(env, conn, {
    onSessionError: (error) =>
      markReconnectRequired(
        db,
        conn.workspaceId,
        conn.connectionId,
        error.code,
      ),
  });
}

export async function getGraphForAsset(
  db: D1Database,
  env: ConnectionEnv,
  scope: Scope,
  adAccountAssetId: string,
) {
  const row = await findEnabledAdAccount(db, scope, adAccountAssetId);
  if (!row) throw notFound();
  const { asset, connection } = row;
  if (connection.status !== "active") {
    throw conflict("META_RECONNECT_REQUIRED");
  }
  const token = await decryptToken(
    env,
    {
      ciphertext: new Uint8Array(connection.tokenCiphertext),
      iv: new Uint8Array(connection.tokenIv),
      keyVersion: connection.tokenKeyVersion,
    },
    aadFor("meta_connections", connection.id, scope.workspaceId),
  );
  const graph = graphForConnection(db, env, {
    token,
    connectionId: connection.id,
    workspaceId: scope.workspaceId,
  });
  return { graph, asset };
}
