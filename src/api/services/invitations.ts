import type { InvitationStatus } from "../../shared/constants";
import type {
  AcceptInvitationResponse,
  CreateInvitationRequest,
  InvitationDto,
} from "../../shared/schemas/invitations";
import type { PaginationQuery } from "../../shared/schemas/common";
import { buildInvitationEmail } from "../emails/invitation";
import type { Env } from "../env";
import { sendEmail } from "../integrations/resend/client";
import { AppError, conflict, notFound, unprocessable } from "../lib/errors";
import { randomToken, sha256Hex } from "../lib/hash";
import { decodeCursor, paginate } from "../lib/cursor";
import { newId } from "../lib/ids";
import { now } from "../lib/time";
import { writeAudit } from "../repositories/audit";
import {
  type AcceptContext,
  consumeInvitation,
  findAcceptContext,
  findInviteContext,
  insertInvitation,
  type InvitationRow,
  revokeInvitation,
  selectInvitations,
} from "../repositories/invitations";
import type { Scope } from "../repositories/scope";
import type { SessionUser } from "../types";
import { manualAuditEntry } from "./audit-entry";
import { isSuperadminEmail } from "./auth/emails";
import { createSession, type SessionMeta } from "./auth/session";
import { upsertLoginUser } from "../repositories/users";

const INVITATION_TTL = 7 * 24 * 60 * 60 * 1000;

type InvitationEnv = Pick<
  Env,
  "DB" | "APP_ORIGIN" | "SUPERADMIN_EMAIL" | "RESEND_API_KEY" | "EMAIL_FROM"
>;

const statusOf = (row: InvitationRow, at: number): InvitationStatus => {
  if (row.acceptedAt !== null) return "accepted";
  if (row.revokedAt !== null) return "revoked";
  return row.expiresAt <= at ? "expired" : "pending";
};

const toInvitationDto = (row: InvitationRow, at: number): InvitationDto => ({
  id: row.id,
  email: row.email,
  role: row.role,
  expiresAt: new Date(row.expiresAt).toISOString(),
  status: statusOf(row, at),
});

const invitationExpired = () => new AppError(410, "INVITATION_EXPIRED");

export async function listInvitations(
  db: D1Database,
  scope: Scope,
  { cursor, limit }: PaginationQuery,
) {
  const at = now();
  const after = cursor ? decodeCursor(cursor).id : undefined;
  const page = paginate(
    await selectInvitations(db, scope, { after, size: limit }),
    limit,
  );
  return {
    data: page.rows.map((row) => toInvitationDto(row, at)),
    nextCursor: page.nextCursor,
  };
}

export async function createInvitation(
  env: InvitationEnv,
  scope: Scope,
  inviter: SessionUser,
  { email, role }: CreateInvitationRequest,
  requestId: string,
) {
  const at = now();
  const context = await findInviteContext(env.DB, scope, email, at);
  if (context.isMember) throw conflict("ALREADY_MEMBER");
  if (context.hasPending) throw conflict("INVITATION_PENDING");
  if (context.seatsTaken >= context.maxMembers) {
    throw unprocessable("PLAN_MEMBER_LIMIT");
  }

  const token = randomToken(32);
  const inserted = await insertInvitation(env.DB, scope, {
    id: newId(),
    email,
    role,
    tokenHash: await sha256Hex(token),
    createdAt: at,
    expiresAt: at + INVITATION_TTL,
  });
  if (inserted.status === "full") throw unprocessable("PLAN_MEMBER_LIMIT");
  if (inserted.status !== "created") throw conflict("INVITATION_PENDING");
  const { invitation } = inserted;

  try {
    await sendEmail(env, {
      to: email,
      ...buildInvitationEmail({
        appOrigin: env.APP_ORIGIN,
        token,
        workspaceName: context.workspaceName,
        inviterEmail: inviter.email,
        role,
      }),
    });
  } catch (error) {
    await revokeInvitation(env.DB, scope, invitation.id, now());
    throw error;
  }

  await writeAudit(
    env.DB,
    manualAuditEntry(scope, requestId, {
      action: "member.invite",
      objectType: "invitation",
      objectName: email,
      detail: { invitationId: invitation.id, role },
    }),
  );
  return { invitation: toInvitationDto(invitation, at) };
}

export async function revokeWorkspaceInvitation(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  if (!(await revokeInvitation(db, scope, id, now()))) throw notFound();
}

function assertAcceptable(
  invitation: AcceptContext | null,
  at: number,
  sessionUser?: SessionUser,
): AcceptContext {
  const usable =
    invitation !== null &&
    statusOf(invitation, at) === "pending" &&
    invitation.workspaceStatus === "active" &&
    invitation.userStatus !== "disabled";
  if (!usable) throw invitationExpired();
  if (sessionUser && sessionUser.email !== invitation.email) {
    throw conflict("EMAIL_MISMATCH");
  }
  return invitation;
}

export async function acceptInvitation(
  env: InvitationEnv,
  token: string,
  sessionUser: SessionUser | undefined,
  meta: SessionMeta,
  requestId: string,
): Promise<{ result: AcceptInvitationResponse; cookie?: string }> {
  const at = now();
  const tokenHash = await sha256Hex(token);
  const invitation = assertAcceptable(
    await findAcceptContext(env.DB, tokenHash),
    at,
    sessionUser,
  );

  const user =
    sessionUser ??
    (await upsertLoginUser(env.DB, {
      id: newId(),
      email: invitation.email,
      isSuperadmin: isSuperadminEmail(env, invitation.email),
      at,
    }));
  const consumed = await consumeInvitation(env.DB, {
    tokenHash,
    userId: user.id,
    at,
  });
  if (!consumed) throw invitationExpired();
  await writeAudit(env.DB, {
    workspaceId: consumed.workspaceId,
    actorUserId: user.id,
    actorType: "user",
    origin: "manual",
    action: "member.join",
    objectType: "invitation",
    objectName: invitation.email,
    detail: {
      invitationId: invitation.id,
      role: invitation.memberRole ?? consumed.role,
    },
    requestId,
  });

  const result = {
    workspaceId: consumed.workspaceId,
    role: invitation.memberRole ?? consumed.role,
  };
  if (sessionUser) return { result };
  const { cookie } = await createSession(env.DB, user.id, meta);
  return { result, cookie };
}
