import { and, eq, inArray, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { creatives, uploads } from "../../db/schema/creatives";
import type { CreativeKind } from "../../shared/schemas/creatives";
import {
  type CreativeRow,
  displayName,
  type NewCreative,
  selectCreativeById,
} from "./creatives";
import { inWorkspace, type Scope } from "./scope";

export type UploadStatus = "uploading" | "completed" | "aborted" | "expired";

export type NewUpload = Omit<
  typeof uploads.$inferInsert,
  "workspaceId" | "createdBy" | "creativeId"
>;

export type UploadOffsets = { startOffset: number; endOffset: number };

const byId = (scope: Scope, id: string) =>
  and(inWorkspace(uploads, scope), eq(uploads.id, id));

const isActive = (scope: Scope, id: string) =>
  and(byId(scope, id), eq(uploads.status, "uploading"));

const isAtOffset = (scope: Scope, id: string, startOffset: number) =>
  and(isActive(scope, id), eq(uploads.startOffset, startOffset));

const uploadingCreativeOf = (
  orm: DrizzleD1Database,
  scope: Scope,
  activeUpload: ReturnType<typeof isActive>,
) =>
  and(
    inWorkspace(creatives, scope),
    eq(creatives.status, "uploading"),
    inArray(
      creatives.id,
      orm.select({ id: uploads.creativeId }).from(uploads).where(activeUpload),
    ),
  );

export async function insertUpload(
  db: D1Database,
  scope: Scope,
  creative: NewCreative,
  upload: NewUpload,
) {
  const owner = { workspaceId: scope.workspaceId, createdBy: scope.userId };
  const orm = drizzle(db);
  await orm.batch([
    orm.insert(creatives).values({ ...creative, ...owner }),
    orm
      .insert(uploads)
      .values({ ...upload, ...owner, creativeId: creative.id }),
  ]);
}

export async function findUpload(db: D1Database, scope: Scope, id: string) {
  const [row] = await drizzle(db)
    .select({
      id: uploads.id,
      creativeId: uploads.creativeId,
      adAccountAssetId: uploads.adAccountAssetId,
      kind: sql<CreativeKind>`${uploads.kind}`,
      sizeBytes: uploads.sizeBytes,
      metaUploadSessionId: uploads.metaUploadSessionId,
      startOffset: uploads.startOffset,
      endOffset: uploads.endOffset,
      status: sql<UploadStatus>`${uploads.status}`,
      expiresAt: uploads.expiresAt,
      fileName: creatives.originalFilename,
      title: displayName,
    })
    .from(uploads)
    .leftJoin(
      creatives,
      and(eq(creatives.id, uploads.creativeId), inWorkspace(creatives, scope)),
    )
    .where(byId(scope, id))
    .limit(1);
  return row ?? null;
}

export type UploadRow = NonNullable<Awaited<ReturnType<typeof findUpload>>>;

const advance = (
  orm: DrizzleD1Database,
  scope: Scope,
  upload: Pick<UploadRow, "id" | "startOffset">,
  offsets: UploadOffsets,
) =>
  orm
    .update(uploads)
    .set(offsets)
    .where(isAtOffset(scope, upload.id, upload.startOffset))
    .returning({ id: uploads.id });

export async function advanceUpload(
  db: D1Database,
  scope: Scope,
  upload: Pick<UploadRow, "id" | "startOffset">,
  offsets: UploadOffsets,
): Promise<boolean> {
  const rows = await advance(drizzle(db), scope, upload, offsets);
  return rows.length > 0;
}

export async function recordUploadedImage(
  db: D1Database,
  scope: Scope,
  upload: Pick<UploadRow, "id" | "startOffset">,
  offsets: UploadOffsets,
  image: { hash: string; url: string },
  at: number,
): Promise<boolean> {
  const orm = drizzle(db);
  const [, advanced] = await orm.batch([
    orm
      .update(creatives)
      .set({
        metaImageHash: image.hash,
        thumbnailUrl: image.url,
        thumbnailRefreshedAt: at,
        updatedAt: at,
      })
      .where(
        uploadingCreativeOf(
          orm,
          scope,
          isAtOffset(scope, upload.id, upload.startOffset),
        ),
      ),
    advance(orm, scope, upload, offsets),
  ]);
  return advanced.length > 0;
}

export async function markUploadCompleted(
  db: D1Database,
  scope: Scope,
  upload: Pick<UploadRow, "id"> & { creativeId: string },
  creativeStatus: "processing" | "ready",
  at: number,
): Promise<CreativeRow | null> {
  const orm = drizzle(db);
  const [, completed, [creative]] = await orm.batch([
    orm
      .update(creatives)
      .set({ status: creativeStatus, updatedAt: at })
      .where(uploadingCreativeOf(orm, scope, isActive(scope, upload.id))),
    orm
      .update(uploads)
      .set({ status: "completed" })
      .where(isActive(scope, upload.id))
      .returning({ id: uploads.id }),
    selectCreativeById(orm, scope, upload.creativeId),
  ]);
  return completed.length > 0 ? (creative ?? null) : null;
}

export async function markUploadAborted(
  db: D1Database,
  scope: Scope,
  id: string,
): Promise<UploadStatus | null> {
  const orm = drizzle(db);
  const [, , [upload]] = await orm.batch([
    orm
      .delete(creatives)
      .where(uploadingCreativeOf(orm, scope, isActive(scope, id))),
    orm.update(uploads).set({ status: "aborted" }).where(isActive(scope, id)),
    orm
      .select({ status: sql<UploadStatus>`${uploads.status}` })
      .from(uploads)
      .where(byId(scope, id))
      .limit(1),
  ]);
  return upload?.status ?? null;
}
