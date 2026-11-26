import type { PaginationQuery } from "../../shared/schemas/common";
import type {
  BetaInviteDto,
  CreateBetaInviteRequest,
} from "../../shared/schemas/admin";
import { buildBetaWelcomeEmail } from "../emails/beta-welcome";
import type { Env } from "../env";
import { sendEmail } from "../integrations/resend/client";
import { decodeCursor, paginate } from "../lib/cursor";
import { conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { logEvent } from "../lib/logger";
import { now, toIsoOrNull } from "../lib/time";
import {
  type BetaInviteRow,
  insertBetaInvite,
  revokeBetaInvite,
  selectBetaInvites,
} from "../repositories/beta-invites";
import type { SessionUser } from "../types";
import { type MetaTesterEnv, tryAddAppTester } from "./meta-testers";

type BetaInviteEnv = MetaTesterEnv &
  Pick<Env, "DB" | "APP_ORIGIN" | "RESEND_API_KEY" | "EMAIL_FROM">;

const toBetaInviteDto = (row: BetaInviteRow): BetaInviteDto => ({
  id: row.id,
  email: row.email,
  note: row.note,
  usedAt: toIsoOrNull(row.usedAt),
  revokedAt: toIsoOrNull(row.revokedAt),
});

export async function listBetaInvites(
  db: D1Database,
  { cursor, limit }: PaginationQuery,
) {
  const after = cursor ? decodeCursor(cursor).id : undefined;
  const page = paginate(
    await selectBetaInvites(db, { after, size: limit }),
    limit,
  );
  return { data: page.rows.map(toBetaInviteDto), nextCursor: page.nextCursor };
}

async function trySendWelcomeEmail(
  env: BetaInviteEnv,
  to: string,
  requestId: string,
): Promise<boolean> {
  try {
    await sendEmail(env, {
      to,
      ...buildBetaWelcomeEmail({ appOrigin: env.APP_ORIGIN }),
    });
    return true;
  } catch {
    logEvent("warn", "beta_invite.email_failed", { requestId });
    return false;
  }
}

function tryAddInvitedTester(
  env: BetaInviteEnv,
  facebookUserId: string,
  requestId: string,
): Promise<boolean> {
  return tryAddAppTester(env, facebookUserId).catch(() => {
    logEvent("warn", "beta_invite.meta_tester_failed", { requestId });
    return false;
  });
}

export async function createBetaInvite(
  env: BetaInviteEnv,
  admin: SessionUser,
  { email, note, facebookUserId }: CreateBetaInviteRequest,
  requestId: string,
) {
  const invite = await insertBetaInvite(env.DB, {
    id: newId(),
    email,
    note: note ?? null,
    invitedBy: admin.id,
    createdAt: now(),
  });
  if (!invite) throw conflict("ALREADY_INVITED");

  const [emailSent, metaTesterAdded] = await Promise.all([
    trySendWelcomeEmail(env, email, requestId),
    facebookUserId ? tryAddInvitedTester(env, facebookUserId, requestId) : null,
  ]);
  return { invite: toBetaInviteDto(invite), emailSent, metaTesterAdded };
}

export async function revokeInvite(db: D1Database, id: string) {
  if (!(await revokeBetaInvite(db, id, now()))) throw notFound();
}
