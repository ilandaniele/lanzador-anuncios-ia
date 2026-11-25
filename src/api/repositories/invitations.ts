import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { plans, users } from "../../db/schema/auth";
import {
  invitations,
  memberships,
  workspaces,
} from "../../db/schema/workspaces";
import type {
  InvitableRole,
  Role,
  WorkspaceStatus,
} from "../../shared/constants";
import { newId } from "../lib/ids";
import { isUniqueViolation } from "./db-errors";
import { inWorkspace, type Scope } from "./scope";

const invitationColumns = {
  id: invitations.id,
  email: invitations.email,
  role: sql<InvitableRole>`${invitations.role}`,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
  revokedAt: invitations.revokedAt,
};

export type InvitationRow = {
  id: string;
  email: string;
  role: InvitableRole;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
};

export type NewInvitation = {
  id: string;
  email: string;
  role: InvitableRole;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
};

export type InviteContext = {
  workspaceName: string;
  maxMembers: number;
  seatsTaken: number;
  isMember: boolean;
  hasPending: boolean;
};

export type AcceptContext = InvitationRow & {
  workspaceId: string;
  workspaceStatus: WorkspaceStatus;
  userStatus: string | null;
  memberRole: Role | null;
};

const stillOpen = () =>
  and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt));

const pendingAt = (at: number) =>
  and(stillOpen(), gt(invitations.expiresAt, at));

export const selectInvitations = (
  db: D1Database,
  scope: Scope,
  page: { after?: string; size: number },
): Promise<InvitationRow[]> =>
  drizzle(db)
    .select(invitationColumns)
    .from(invitations)
    .where(
      and(
        inWorkspace(invitations, scope),
        page.after ? gt(invitations.id, page.after) : undefined,
      ),
    )
    .orderBy(invitations.id)
    .limit(page.size + 1);

export async function findInviteContext(
  db: D1Database,
  scope: Scope,
  email: string,
  at: number,
): Promise<InviteContext> {
  const [row] = await drizzle(db)
    .select({
      workspaceName: workspaces.name,
      maxMembers: plans.maxMembers,
      seatsTaken: seatsTaken(scope, at),
      isMember: sql<number>`EXISTS (SELECT 1 FROM ${memberships}
        INNER JOIN ${users} ON ${users.id} = ${memberships.userId}
        WHERE ${inWorkspace(memberships, scope)} AND ${users.email} = ${email})`,
      hasPending: sql<number>`EXISTS (SELECT 1 FROM ${invitations}
        WHERE ${inWorkspace(invitations, scope)}
          AND ${invitations.email} = ${email} AND ${pendingAt(at)})`,
    })
    .from(workspaces)
    .innerJoin(plans, eq(plans.id, workspaces.planId))
    .where(eq(workspaces.id, scope.workspaceId))
    .limit(1);
  return {
    ...row!,
    isMember: row!.isMember === 1,
    hasPending: row!.hasPending === 1,
  };
}

export type InsertInvitationResult =
  | { status: "created"; invitation: InvitationRow }
  | { status: "duplicate" | "full" };

const seatsTaken = (scope: Scope, at: number) =>
  sql<number>`(SELECT count(*) FROM ${memberships}
    WHERE ${inWorkspace(memberships, scope)})
    + (SELECT count(*) FROM ${invitations}
    WHERE ${inWorkspace(invitations, scope)} AND ${pendingAt(at)})`;

export async function insertInvitation(
  db: D1Database,
  scope: Scope,
  row: NewInvitation,
): Promise<InsertInvitationResult> {
  const orm = drizzle(db);
  try {
    const [, [inserted]] = await orm.batch([
      orm
        .update(invitations)
        .set({ revokedAt: row.createdAt })
        .where(
          and(
            inWorkspace(invitations, scope),
            eq(invitations.email, row.email),
            stillOpen(),
            lte(invitations.expiresAt, row.createdAt),
          ),
        ),
      orm
        .insert(invitations)
        .select(
          orm
            .select({
              id: sql<string>`${row.id}`.as("id"),
              workspaceId: workspaces.id,
              email: sql<string>`${row.email}`.as("email"),
              role: sql<string>`${row.role}`.as("role"),
              tokenHash: sql<string>`${row.tokenHash}`.as("token_hash"),
              invitedBy: sql<string>`${scope.userId}`.as("invited_by"),
              createdAt: sql<number>`${row.createdAt}`.as("created_at"),
              expiresAt: sql<number>`${row.expiresAt}`.as("expires_at"),
              acceptedAt: sql<null>`NULL`.as("accepted_at"),
              acceptedBy: sql<null>`NULL`.as("accepted_by"),
              revokedAt: sql<null>`NULL`.as("revoked_at"),
            })
            .from(workspaces)
            .innerJoin(plans, eq(plans.id, workspaces.planId))
            .where(
              and(
                eq(workspaces.id, scope.workspaceId),
                sql`${seatsTaken(scope, row.createdAt)} < ${plans.maxMembers}`,
              ),
            ),
        )
        .returning(invitationColumns),
    ]);
    return inserted
      ? { status: "created", invitation: inserted }
      : { status: "full" };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "duplicate" };
    throw error;
  }
}

export async function revokeInvitation(
  db: D1Database,
  scope: Scope,
  id: string,
  at: number,
): Promise<boolean> {
  const [row] = await drizzle(db)
    .update(invitations)
    .set({ revokedAt: sql`coalesce(${invitations.revokedAt}, ${at})` })
    .where(
      and(
        inWorkspace(invitations, scope),
        eq(invitations.id, id),
        isNull(invitations.acceptedAt),
      ),
    )
    .returning({ id: invitations.id });
  return row !== undefined;
}

export async function findAcceptContext(
  db: D1Database,
  tokenHash: string,
): Promise<AcceptContext | null> {
  const [row] = await drizzle(db)
    .select({
      ...invitationColumns,
      workspaceId: invitations.workspaceId,
      workspaceStatus: sql<WorkspaceStatus>`${workspaces.status}`,
      userStatus: users.status,
      memberRole: sql<Role | null>`${memberships.role}`,
    })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .leftJoin(users, eq(users.email, invitations.email))
    .leftJoin(
      memberships,
      and(
        eq(memberships.workspaceId, invitations.workspaceId),
        eq(memberships.userId, users.id),
      ),
    )
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function consumeInvitation(
  db: D1Database,
  claim: { tokenHash: string; userId: string; at: number },
): Promise<{ workspaceId: string; role: InvitableRole } | null> {
  const { tokenHash, userId, at } = claim;
  const orm = drizzle(db);
  const [[consumed]] = await orm.batch([
    orm
      .update(invitations)
      .set({ acceptedAt: at, acceptedBy: userId })
      .where(and(eq(invitations.tokenHash, tokenHash), pendingAt(at)))
      .returning({
        workspaceId: invitations.workspaceId,
        role: sql<InvitableRole>`${invitations.role}`,
      }),
    orm
      .insert(memberships)
      .select(
        orm
          .select({
            id: sql<string>`${newId()}`.as("id"),
            workspaceId: invitations.workspaceId,
            userId: sql<string>`${userId}`.as("user_id"),
            role: invitations.role,
            invitedBy: invitations.invitedBy,
            createdAt: sql<number>`${at}`.as("created_at"),
            updatedAt: sql<number>`${at}`.as("updated_at"),
          })
          .from(invitations)
          .where(
            and(
              eq(invitations.tokenHash, tokenHash),
              eq(invitations.acceptedBy, userId),
              eq(invitations.acceptedAt, at),
            ),
          ),
      )
      .onConflictDoNothing(),
  ]);
  return consumed ?? null;
}
