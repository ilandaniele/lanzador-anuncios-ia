import type { Env } from "../../env";
import { notFound } from "../../lib/errors";
import { randomToken } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { parseSignedRequest } from "../../lib/signed-request";
import { now, toIsoOrNull } from "../../lib/time";
import type { AuditEntry } from "../../repositories/audit";
import {
  findDataDeletionStatus,
  insertDataDeletionRequest,
} from "../../repositories/data-deletion-requests";
import {
  markMetaUserReconnectRequired,
  type MetaUserConnection,
} from "../../repositories/meta-connections";
import { enqueueJob } from "../jobs";

const CONFIRMATION_CODE_BYTES = 12;
const CONFIRMATION_CODE = /^[A-Za-z0-9_-]{16}$/;

const deauthorizedAuditEntry =
  (requestId: string) =>
  (connection: MetaUserConnection): AuditEntry => ({
    workspaceId: connection.workspaceId,
    actorUserId: null,
    actorType: "system",
    origin: "system",
    action: "meta.deauthorized",
    objectType: "meta_connection",
    objectName: connection.businessName ?? undefined,
    detail: { connectionId: connection.id },
    requestId,
  });

export async function deauthorizeMetaUser(
  env: Pick<Env, "DB" | "META_APP_SECRET">,
  signedRequest: unknown,
  requestId: string,
) {
  const { metaUserId } = await parseSignedRequest(
    signedRequest,
    env.META_APP_SECRET,
  );
  await markMetaUserReconnectRequired(
    env.DB,
    metaUserId,
    deauthorizedAuditEntry(requestId),
    now(),
  );
  return { ok: true };
}

export async function requestDataDeletion(
  env: Pick<Env, "DB" | "JOB_WF" | "META_APP_SECRET" | "APP_ORIGIN">,
  signedRequest: unknown,
) {
  const { metaUserId } = await parseSignedRequest(
    signedRequest,
    env.META_APP_SECRET,
  );
  const id = newId();
  const confirmationCode = randomToken(CONFIRMATION_CODE_BYTES);
  await insertDataDeletionRequest(env.DB, {
    id,
    confirmationCode,
    metaUserId,
    createdAt: now(),
  });
  await enqueueJob(env, {
    kind: "meta_disconnect_cleanup",
    key: id,
    workspaceId: null,
    payload: { requestId: id },
  });
  return {
    url: `${env.APP_ORIGIN}/api/meta/data-deletion/${confirmationCode}`,
    confirmation_code: confirmationCode,
  };
}

export async function dataDeletionStatus(db: D1Database, code: string) {
  if (!CONFIRMATION_CODE.test(code)) throw notFound();
  const row = await findDataDeletionStatus(db, code);
  if (!row) throw notFound();
  return {
    status: row.status,
    receivedAt: new Date(row.createdAt).toISOString(),
    completedAt: toIsoOrNull(row.completedAt),
  };
}
