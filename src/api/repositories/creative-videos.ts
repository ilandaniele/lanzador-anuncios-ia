import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { inWorkspace, type Scope } from "./scope";

export interface ReadyVideo {
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  formatWarning: "horizontal" | null;
}

const processingVideo = (scope: Scope, id: string) =>
  and(
    inWorkspace(creatives, scope),
    eq(creatives.id, id),
    eq(creatives.kind, "video"),
    eq(creatives.status, "processing"),
  );

export async function findProcessingVideo(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      adAccountAssetId: creatives.adAccountAssetId,
      metaVideoId: creatives.metaVideoId,
    })
    .from(creatives)
    .where(processingVideo(scope, id))
    .limit(1);
  return row ?? null;
}

export async function markVideoReady(
  db: D1Database,
  scope: Scope,
  id: string,
  { thumbnailUrl, width, height, formatWarning }: ReadyVideo,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(creatives)
    .set({
      status: "ready",
      thumbnailUrl,
      thumbnailRefreshedAt: thumbnailUrl ? at : null,
      formatWarning,
      ...(width && height ? { width, height } : {}),
      updatedAt: at,
    })
    .where(processingVideo(scope, id));
}

export async function markVideoFailed(
  db: D1Database,
  scope: Scope,
  id: string,
  error: string,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(creatives)
    .set({ status: "failed", error, updatedAt: at })
    .where(processingVideo(scope, id));
}
