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
import { now, toIsoOrNull } from "../lib/time";
import {
  type BetaInviteRow,
  insertBetaInvite,
  revokeBetaInvite,
  selectBetaInvites,
} from "../repositories/beta-invites";
import type { SessionUser } from "../types";

type BetaInviteEnv = Pick<
  Env,
  "DB" | "APP_ORIGIN" | "RESEND_API_KEY" | "EMAIL_FROM"
>;

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

export async function createBetaInvite(
  env: BetaInviteEnv,
  admin: SessionUser,
  { email, note }: CreateBetaInviteRequest,
) {
  const invite = await insertBetaInvite(env.DB, {
    id: newId(),
    email,
    note: note ?? null,
    invitedBy: admin.id,
    createdAt: now(),
  });
  if (!invite) throw conflict("ALREADY_INVITED");

  try {
    await sendEmail(env, {
      to: email,
      ...buildBetaWelcomeEmail({ appOrigin: env.APP_ORIGIN }),
    });
  } catch (error) {
    await revokeBetaInvite(env.DB, invite.id, now());
    throw error;
  }
  return { invite: toBetaInviteDto(invite) };
}

export async function revokeInvite(db: D1Database, id: string) {
  if (!(await revokeBetaInvite(db, id, now()))) throw notFound();
}
