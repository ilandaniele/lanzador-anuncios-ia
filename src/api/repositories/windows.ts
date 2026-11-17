import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { magicLinks } from "../../db/schema/auth";

export async function countRecentMagicLinks(
  db: D1Database,
  email: string,
  since: number,
  limit: number,
): Promise<number> {
  const rows = await drizzle(db)
    .select({ id: magicLinks.id })
    .from(magicLinks)
    .where(and(eq(magicLinks.email, email), gt(magicLinks.createdAt, since)))
    .limit(limit);
  return rows.length;
}
