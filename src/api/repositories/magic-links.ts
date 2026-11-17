import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { betaInvites, magicLinks, users } from "../../db/schema/auth";
import { invitations } from "../../db/schema/workspaces";

export type NewMagicLink = typeof magicLinks.$inferInsert;

export type MagicLinkAccess = {
  userId: string | null;
  disabled: boolean;
  invited: boolean;
};

const MAX_LINKS_PER_EMAIL = 15;
const MAX_LINKS_PER_EMAIL_AND_IP = 5;

export async function findMagicLinkAccess(
  db: D1Database,
  email: string,
  at: number,
): Promise<MagicLinkAccess> {
  const row = await drizzle(db).get<{
    userId: string | null;
    disabled: number;
    invited: number;
  }>(
    sql`SELECT
      (SELECT ${users.id} FROM ${users}
        WHERE ${users.email} = ${email} AND ${users.status} = 'active') AS userId,
      EXISTS (SELECT 1 FROM ${users}
        WHERE ${users.email} = ${email} AND ${users.status} = 'disabled') AS disabled,
      (EXISTS (SELECT 1 FROM ${betaInvites}
        WHERE ${betaInvites.email} = ${email} AND ${betaInvites.revokedAt} IS NULL)
      OR EXISTS (SELECT 1 FROM ${invitations}
        WHERE ${invitations.email} = ${email} AND ${invitations.acceptedAt} IS NULL
          AND ${invitations.revokedAt} IS NULL AND ${invitations.expiresAt} > ${at})
      ) AS invited`,
  );
  return {
    userId: row?.userId ?? null,
    disabled: row?.disabled === 1,
    invited: row?.invited === 1,
  };
}

export async function insertMagicLinkWithinCaps(
  db: D1Database,
  row: NewMagicLink,
  since: number,
): Promise<boolean> {
  const ipHash = row.ipHash ?? null;
  const inserted = await drizzle(db).get<{ id: string }>(
    sql`INSERT INTO ${magicLinks}
        (id, token_hash, email, user_id, created_at, expires_at, ip_hash)
      SELECT ${row.id}, ${row.tokenHash}, ${row.email}, ${row.userId ?? null},
        ${row.createdAt}, ${row.expiresAt}, ${ipHash}
      WHERE (SELECT count(*) FROM ${magicLinks}
          WHERE ${magicLinks.email} = ${row.email} AND ${magicLinks.createdAt} > ${since})
        < ${MAX_LINKS_PER_EMAIL}
      AND (${ipHash} IS NULL OR (SELECT count(*) FROM ${magicLinks}
          WHERE ${magicLinks.email} = ${row.email} AND ${magicLinks.ipHash} = ${ipHash}
            AND ${magicLinks.createdAt} > ${since})
        < ${MAX_LINKS_PER_EMAIL_AND_IP})
      RETURNING id`,
  );
  return inserted !== undefined;
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
  const orm = drizzle(db);
  const [[row]] = await orm.batch([
    orm
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
      .returning({ email: magicLinks.email }),
    orm
      .update(magicLinks)
      .set({ invalidatedAt: at })
      .where(
        and(
          isNull(magicLinks.usedAt),
          isNull(magicLinks.invalidatedAt),
          eq(
            magicLinks.email,
            sql`(SELECT ${magicLinks.email} FROM ${magicLinks}
              WHERE ${magicLinks.tokenHash} = ${tokenHash} AND ${magicLinks.usedAt} = ${at})`,
          ),
        ),
      ),
  ]);
  return row ?? null;
}
