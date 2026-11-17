import { and, eq, gt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sessions, users } from "../../db/schema/auth";

export type NewSession = typeof sessions.$inferInsert;

export async function insertSession(
  db: D1Database,
  row: NewSession,
): Promise<void> {
  await drizzle(db).insert(sessions).values(row);
}

export async function findSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
  previousRotatedAfter: number,
) {
  const [row] = await drizzle(db)
    .select({
      sessionId: sessions.id,
      tokenHash: sessions.tokenHash,
      rotatedAt: sessions.rotatedAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      isSuperadmin: users.isSuperadmin,
      userStatus: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      or(
        eq(sessions.tokenHash, tokenHash),
        and(
          eq(sessions.previousTokenHash, tokenHash),
          gt(sessions.rotatedAt, previousRotatedAfter),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function rotateSessionToken(
  db: D1Database,
  sessionId: string,
  currentHash: string,
  nextHash: string,
  at: number,
): Promise<boolean> {
  const rotated = await drizzle(db)
    .update(sessions)
    .set({
      tokenHash: nextHash,
      previousTokenHash: currentHash,
      rotatedAt: at,
      lastSeenAt: at,
    })
    .where(and(eq(sessions.id, sessionId), eq(sessions.tokenHash, currentHash)))
    .returning({ id: sessions.id });
  return rotated.length > 0;
}

export async function touchSession(
  db: D1Database,
  sessionId: string,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(sessions)
    .set({ lastSeenAt: at })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSession(
  db: D1Database,
  sessionId: string,
): Promise<void> {
  await drizzle(db).delete(sessions).where(eq(sessions.id, sessionId));
}
