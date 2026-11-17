import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { betaInvites, magicLinks, users } from "../../db/schema/auth";
import { invitations } from "../../db/schema/workspaces";

export type NewMagicLink = typeof magicLinks.$inferInsert;

export type MagicLinkAccess = { userId: string | null; invited: boolean };

export async function findMagicLinkAccess(
  db: D1Database,
  email: string,
  at: number,
): Promise<MagicLinkAccess> {
  const row = await drizzle(db).get<{ userId: string | null; invited: number }>(
    sql`SELECT
      (SELECT ${users.id} FROM ${users}
        WHERE ${users.email} = ${email} AND ${users.status} = 'active') AS userId,
      (EXISTS (SELECT 1 FROM ${betaInvites}
        WHERE ${betaInvites.email} = ${email} AND ${betaInvites.revokedAt} IS NULL)
      OR EXISTS (SELECT 1 FROM ${invitations}
        WHERE ${invitations.email} = ${email} AND ${invitations.acceptedAt} IS NULL
          AND ${invitations.revokedAt} IS NULL AND ${invitations.expiresAt} > ${at})
      ) AS invited`,
  );
  return { userId: row?.userId ?? null, invited: row?.invited === 1 };
}

export async function insertMagicLink(
  db: D1Database,
  row: NewMagicLink,
): Promise<void> {
  await drizzle(db).insert(magicLinks).values(row);
}

export async function invalidateMagicLink(
  db: D1Database,
  id: string,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(magicLinks)
    .set({ invalidatedAt: at })
    .where(eq(magicLinks.id, id));
}

export async function consumeMagicLink(
  db: D1Database,
  tokenHash: string,
  at: number,
): Promise<{ email: string } | null> {
  const [row] = await drizzle(db)
    .update(magicLinks)
    .set({ usedAt: at })
    .where(
      and(
        eq(magicLinks.tokenHash, tokenHash),
        isNull(magicLinks.usedAt),
        isNull(magicLinks.invalidatedAt),
        gt(magicLinks.expiresAt, at),
      ),
    )
    .returning({ email: magicLinks.email });
  return row ?? null;
}
