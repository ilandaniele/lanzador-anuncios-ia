import { and, count, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { creatives } from "../../db/schema/creatives";
import { memberships } from "../../db/schema/workspaces";
import type { Role } from "../../shared/constants";
import type {
  CreativeKind,
  CreativeStatus,
} from "../../shared/schemas/creatives";
import { chunk } from "../lib/chunk";
import type { NewCreative } from "./creatives";
import { inWorkspace, type Scope } from "./scope";

const D1_MAX_BOUND_PARAMS = 100;
const ROWS_PER_INSERT = Math.floor(
  D1_MAX_BOUND_PARAMS / Object.keys(getTableColumns(creatives)).length,
);

const importingCreative = (scope: Scope, id: string) =>
  and(
    inWorkspace(creatives, scope),
    eq(creatives.id, id),
    eq(creatives.status, "importing"),
  );

export async function insertImportingCreatives(
  db: D1Database,
  scope: Scope,
  rows: NewCreative[],
): Promise<void> {
  const orm = drizzle(db);
  const owner = { workspaceId: scope.workspaceId, createdBy: scope.userId };
  const [first, ...rest] = chunk(rows, ROWS_PER_INSERT).map((group) =>
    orm.insert(creatives).values(group.map((row) => ({ ...row, ...owner }))),
  );
  if (!first) return;
  await orm.batch([first, ...rest]);
}

export async function countImportingCreatives(
  db: D1Database,
  scope: Scope,
): Promise<number> {
  const [row] = await drizzle(db)
    .select({ total: count() })
    .from(creatives)
    .where(
      and(inWorkspace(creatives, scope), eq(creatives.status, "importing")),
    );
  return row?.total ?? 0;
}

export async function findImportingCreative(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      kind: sql<CreativeKind>`${creatives.kind}`,
      sizeBytes: creatives.sizeBytes,
      fileName: creatives.originalFilename,
      createdBy: creatives.createdBy,
      creatorRole: sql<Role | null>`${memberships.role}`,
    })
    .from(creatives)
    .leftJoin(
      memberships,
      and(
        eq(memberships.workspaceId, creatives.workspaceId),
        eq(memberships.userId, creatives.createdBy),
      ),
    )
    .where(importingCreative(scope, id))
    .limit(1);
  return row ?? null;
}

export async function markImportedImage(
  db: D1Database,
  scope: Scope,
  id: string,
  image: { hash: string; url: string },
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(creatives)
    .set({
      status: "ready",
      metaImageHash: image.hash,
      thumbnailUrl: image.url,
      thumbnailRefreshedAt: at,
      updatedAt: at,
    })
    .where(importingCreative(scope, id));
}

export async function markImportedVideo(
  db: D1Database,
  scope: Scope,
  id: string,
  metaVideoId: string,
  at: number,
): Promise<void> {
  await drizzle(db)
    .update(creatives)
    .set({ status: "processing", metaVideoId, updatedAt: at })
    .where(importingCreative(scope, id));
}

async function markFailed(
  db: D1Database,
  scope: Scope,
  ids: string[],
  statuses: CreativeStatus[],
  failure: { error: string; at: number },
): Promise<void> {
  if (ids.length === 0) return;
  await drizzle(db)
    .update(creatives)
    .set({ status: "failed", error: failure.error, updatedAt: failure.at })
    .where(
      and(
        inWorkspace(creatives, scope),
        inArray(creatives.id, ids),
        inArray(creatives.status, statuses),
      ),
    );
}

export const markImportsFailed = (
  db: D1Database,
  scope: Scope,
  ids: string[],
  error: string,
  at: number,
) => markFailed(db, scope, ids, ["importing"], { error, at });

export const markImportFailed = (
  db: D1Database,
  scope: Scope,
  id: string,
  error: string,
  at: number,
) => markFailed(db, scope, [id], ["importing", "processing"], { error, at });
