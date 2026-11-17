import { eq, gt, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { betaInvites } from "../../db/schema/auth";

const betaInviteColumns = {
  id: betaInvites.id,
  email: betaInvites.email,
  note: betaInvites.note,
  usedAt: betaInvites.usedAt,
  revokedAt: betaInvites.revokedAt,
};

export type BetaInviteRow = {
  id: string;
  email: string;
  note: string | null;
  usedAt: number | null;
  revokedAt: number | null;
};

export type NewBetaInvite = {
  id: string;
  email: string;
  note: string | null;
  invitedBy: string;
  createdAt: number;
};

export const selectBetaInvites = (
  db: D1Database,
  page: { after?: string; size: number },
): Promise<BetaInviteRow[]> =>
  drizzle(db)
    .select(betaInviteColumns)
    .from(betaInvites)
    .where(page.after ? gt(betaInvites.id, page.after) : undefined)
    .orderBy(betaInvites.id)
    .limit(page.size + 1);

export async function insertBetaInvite(
  db: D1Database,
  row: NewBetaInvite,
): Promise<BetaInviteRow | null> {
  const [invite] = await drizzle(db)
    .insert(betaInvites)
    .values(row)
    .onConflictDoUpdate({
      target: betaInvites.email,
      set: { note: row.note, invitedBy: row.invitedBy, revokedAt: null },
      setWhere: isNotNull(betaInvites.revokedAt),
    })
    .returning(betaInviteColumns);
  return invite ?? null;
}

export async function revokeBetaInvite(
  db: D1Database,
  id: string,
  at: number,
): Promise<boolean> {
  const [row] = await drizzle(db)
    .update(betaInvites)
    .set({ revokedAt: sql`coalesce(${betaInvites.revokedAt}, ${at})` })
    .where(eq(betaInvites.id, id))
    .returning({ id: betaInvites.id });
  return row !== undefined;
}
