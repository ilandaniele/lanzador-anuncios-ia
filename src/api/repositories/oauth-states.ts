import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { oauthStates } from "../../db/schema/workspaces";

type OAuthProvider = "meta" | "google";

export async function insertOAuthState(
  db: D1Database,
  row: typeof oauthStates.$inferInsert,
): Promise<void> {
  await drizzle(db).insert(oauthStates).values(row);
}

export async function consumeOAuthState(
  db: D1Database,
  claim: {
    stateHash: string;
    provider: OAuthProvider;
    userId: string;
    at: number;
  },
): Promise<{ workspaceId: string; launchId: string | null } | null> {
  const [row] = await drizzle(db)
    .update(oauthStates)
    .set({ usedAt: claim.at })
    .where(
      and(
        eq(oauthStates.stateHash, claim.stateHash),
        eq(oauthStates.provider, claim.provider),
        eq(oauthStates.userId, claim.userId),
        isNull(oauthStates.usedAt),
        gt(oauthStates.expiresAt, claim.at),
      ),
    )
    .returning({
      workspaceId: oauthStates.workspaceId,
      launchId: oauthStates.launchId,
    });
  return row ?? null;
}
