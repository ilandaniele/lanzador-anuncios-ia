import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { googleConnections, metaConnections } from "../../db/schema/meta";
import type { SealedToken } from "../lib/token-crypto";

export interface StaleToken {
  id: string;
  workspaceId: string;
  ciphertext: Buffer;
  iv: Buffer;
  keyVersion: number;
}

export interface StaleGoogleToken extends StaleToken {
  userId: string;
}

export interface RotatedToken {
  id: string;
  previousVersion: number;
  sealed: SealedToken;
}

export const selectStaleMetaTokens = (
  db: D1Database,
  rotatableVersions: number[],
  limit: number,
): Promise<StaleToken[]> =>
  drizzle(db)
    .select({
      id: metaConnections.id,
      workspaceId: metaConnections.workspaceId,
      ciphertext: metaConnections.tokenCiphertext,
      iv: metaConnections.tokenIv,
      keyVersion: metaConnections.tokenKeyVersion,
    })
    .from(metaConnections)
    .where(inArray(metaConnections.tokenKeyVersion, rotatableVersions))
    .limit(limit);

export const selectStaleGoogleTokens = (
  db: D1Database,
  rotatableVersions: number[],
  limit: number,
): Promise<StaleGoogleToken[]> =>
  drizzle(db)
    .select({
      id: googleConnections.id,
      workspaceId: googleConnections.workspaceId,
      userId: googleConnections.userId,
      ciphertext: googleConnections.refreshTokenCiphertext,
      iv: googleConnections.refreshTokenIv,
      keyVersion: googleConnections.tokenKeyVersion,
    })
    .from(googleConnections)
    .where(inArray(googleConnections.tokenKeyVersion, rotatableVersions))
    .limit(limit);

export async function saveRotatedTokens(
  db: D1Database,
  { meta, google }: { meta: RotatedToken[]; google: RotatedToken[] },
  at: number,
): Promise<void> {
  const orm = drizzle(db);
  const metaUpdates = meta.map(({ id, previousVersion, sealed }) =>
    orm
      .update(metaConnections)
      .set({
        tokenCiphertext: Buffer.from(sealed.ciphertext),
        tokenIv: Buffer.from(sealed.iv),
        tokenKeyVersion: sealed.keyVersion,
        updatedAt: at,
      })
      .where(
        and(
          eq(metaConnections.id, id),
          eq(metaConnections.tokenKeyVersion, previousVersion),
        ),
      ),
  );
  const googleUpdates = google.map(({ id, previousVersion, sealed }) =>
    orm
      .update(googleConnections)
      .set({
        refreshTokenCiphertext: Buffer.from(sealed.ciphertext),
        refreshTokenIv: Buffer.from(sealed.iv),
        tokenKeyVersion: sealed.keyVersion,
        updatedAt: at,
      })
      .where(
        and(
          eq(googleConnections.id, id),
          eq(googleConnections.tokenKeyVersion, previousVersion),
        ),
      ),
  );
  const [first, ...rest] = [...metaUpdates, ...googleUpdates];
  if (!first) return;
  await orm.batch([first, ...rest]);
}
