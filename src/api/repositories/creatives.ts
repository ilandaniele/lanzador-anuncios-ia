import {
  and,
  desc,
  eq,
  getTableName,
  inArray,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import type {
  SQLiteColumn,
  SQLiteUpdateSetSource,
} from "drizzle-orm/sqlite-core";
import { creatives } from "../../db/schema/creatives";
import { launchItems } from "../../db/schema/launches";
import { workspaceSettings } from "../../db/schema/workspaces";
import type {
  AiCreativeTags,
  CreativeAiStatus,
  CreativeKind,
  CreativeStatus,
  TagFormat,
} from "../../shared/schemas/creatives";
import { escapeLike } from "./products";
import { inWorkspace, type Scope } from "./scope";

const LIBRARY_DUPLICATE_STATUSES: CreativeStatus[] = [
  "importing",
  "processing",
  "ready",
];
const ARCHIVABLE_STATUSES: CreativeStatus[] = ["ready", "failed"];

const outerCreative = (column: "id" | "workspace_id" | "created_at") =>
  sql.raw(`"${getTableName(creatives)}"."${column}"`);

const usedInLaunches = sql<number>`(select count(distinct ${launchItems.launchId}) from ${launchItems} where ${launchItems.creativeId} = ${outerCreative("id")} and ${launchItems.workspaceId} = ${outerCreative("workspace_id")})`;

const nameSequence = sql<number>`(select count(*) from ${sql.raw(`"${getTableName(creatives)}"`)} as "peer" where "peer"."workspace_id" = ${outerCreative("workspace_id")} and "peer"."created_at" <= ${outerCreative("created_at")})`;

const adNameTemplate = sql<
  string | null
>`(select ${workspaceSettings.adNameTemplate} from ${workspaceSettings} where ${workspaceSettings.workspaceId} = ${outerCreative("workspace_id")})`;

export const displayName = sql<string>`coalesce(${creatives.adName}, ${creatives.adNameSuggested}, ${creatives.originalFilename})`;

const creativeColumns = {
  id: creatives.id,
  name: displayName,
  kind: sql<CreativeKind>`${creatives.kind}`,
  status: sql<CreativeStatus>`${creatives.status}`,
  adAccountAssetId: creatives.adAccountAssetId,
  thumbnailUrl: creatives.thumbnailUrl,
  formatWarning: sql<"horizontal" | null>`${creatives.formatWarning}`,
  tagHook: creatives.tagHook,
  tagAngle: creatives.tagAngle,
  tagFormat: sql<TagFormat | null>`${creatives.tagFormat}`,
  tagLanguage: creatives.tagLanguage,
  tagOnScreenText: creatives.tagOnScreenText,
  aiStatus: sql<CreativeAiStatus>`${creatives.aiStatus}`,
  usedInLaunches,
  createdAt: creatives.createdAt,
};

export type NewCreative = Omit<
  typeof creatives.$inferInsert,
  "workspaceId" | "createdBy"
>;

export type CreativeChanges = Partial<
  Pick<
    typeof creatives.$inferInsert,
    | "adName"
    | "tagHook"
    | "tagAngle"
    | "tagFormat"
    | "tagLanguage"
    | "tagOnScreenText"
    | "tagsEdited"
  >
>;

export type CreativeListQuery = {
  ids?: string[];
  statuses?: CreativeStatus[];
  kind?: CreativeKind;
  q?: string;
  tag?: string;
  adAccountAssetId?: string;
  sort: "recent" | "most_used";
  after?: { id: string; sortValue: number };
  size: number;
};

const inIdList = (ids: string[]) =>
  sql`${creatives.id} in (select value from json_each(${JSON.stringify(ids)}))`;

const nameContains = (q: string) =>
  sql`${displayName} LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'`;

const hasTag = (tag: string) =>
  or(
    eq(creatives.tagHook, tag),
    eq(creatives.tagAngle, tag),
    eq(creatives.tagFormat, tag),
    eq(creatives.tagLanguage, tag),
  );

const sortExpression = (sort: CreativeListQuery["sort"]): SQL =>
  sort === "most_used" ? usedInLaunches : sql`${creatives.createdAt}`;

const before = (
  sortValueOf: SQL,
  { id, sortValue }: { id: string; sortValue: number },
) =>
  or(
    lt(sortValueOf, sortValue),
    and(eq(sortValueOf, sortValue), lt(creatives.id, id)),
  );

const byId = (scope: Scope, id: string) =>
  and(inWorkspace(creatives, scope), eq(creatives.id, id));

export const selectCreatives = (
  db: D1Database,
  scope: Scope,
  {
    ids,
    statuses,
    kind,
    q,
    tag,
    adAccountAssetId,
    sort,
    after,
    size,
  }: CreativeListQuery,
) => {
  const sortValueOf = sortExpression(sort);
  return drizzle(db)
    .select(creativeColumns)
    .from(creatives)
    .where(
      and(
        inWorkspace(creatives, scope),
        ids ? inIdList(ids) : undefined,
        statuses ? inArray(creatives.status, statuses) : undefined,
        kind ? eq(creatives.kind, kind) : undefined,
        q ? nameContains(q) : undefined,
        tag ? hasTag(tag) : undefined,
        adAccountAssetId
          ? eq(creatives.adAccountAssetId, adAccountAssetId)
          : undefined,
        after ? before(sortValueOf, after) : undefined,
      ),
    )
    .orderBy(desc(sortValueOf), desc(creatives.id))
    .limit(size + 1);
};

export type CreativeRow = Awaited<ReturnType<typeof selectCreatives>>[number];

export const selectCreativeById = (
  orm: DrizzleD1Database,
  scope: Scope,
  id: string,
) =>
  orm.select(creativeColumns).from(creatives).where(byId(scope, id)).limit(1);

export async function findCreative(
  db: D1Database,
  scope: Scope,
  id: string,
): Promise<CreativeRow | null> {
  const [row] = await selectCreativeById(drizzle(db), scope, id);
  return row ?? null;
}

export async function findDuplicateCreativeId(
  db: D1Database,
  scope: Scope,
  sha256: string,
): Promise<string | null> {
  const [row] = await drizzle(db)
    .select({ id: creatives.id })
    .from(creatives)
    .where(
      and(
        inWorkspace(creatives, scope),
        eq(creatives.sha256, sha256),
        inArray(creatives.status, LIBRARY_DUPLICATE_STATUSES),
      ),
    )
    .orderBy(desc(creatives.createdAt))
    .limit(1);
  return row?.id ?? null;
}

async function updateAndRead(
  db: D1Database,
  scope: Scope,
  id: string,
  set: SQLiteUpdateSetSource<typeof creatives>,
  extraWhere?: SQL,
): Promise<CreativeRow | null> {
  const orm = drizzle(db);
  const [, [row]] = await orm.batch([
    orm
      .update(creatives)
      .set(set)
      .where(and(byId(scope, id), extraWhere)),
    selectCreativeById(orm, scope, id),
  ]);
  return row ?? null;
}

export const updateCreative = (
  db: D1Database,
  scope: Scope,
  id: string,
  changes: CreativeChanges,
  at: number,
) => updateAndRead(db, scope, id, { ...changes, updatedAt: at });

export const setCreativeArchived = (
  db: D1Database,
  scope: Scope,
  id: string,
  archived: boolean,
  at: number,
) =>
  archived
    ? updateAndRead(
        db,
        scope,
        id,
        { status: "archived", updatedAt: at },
        inArray(creatives.status, ARCHIVABLE_STATUSES),
      )
    : updateAndRead(
        db,
        scope,
        id,
        {
          status: sql`CASE WHEN ${creatives.error} IS NULL THEN 'ready' ELSE 'failed' END`,
          updatedAt: at,
        },
        eq(creatives.status, "archived"),
      );

export const selectCreativeFacts = (
  db: D1Database,
  scope: Scope,
  ids: string[],
) =>
  drizzle(db)
    .select({
      id: creatives.id,
      kind: sql<CreativeKind>`${creatives.kind}`,
      status: sql<CreativeStatus>`${creatives.status}`,
      adAccountAssetId: creatives.adAccountAssetId,
      formatWarning: sql<"horizontal" | null>`${creatives.formatWarning}`,
    })
    .from(creatives)
    .where(and(inWorkspace(creatives, scope), inIdList(ids)));

export type CreativeFacts = Awaited<
  ReturnType<typeof selectCreativeFacts>
>[number];

export async function findTaggingTarget(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({
      id: creatives.id,
      status: sql<CreativeStatus>`${creatives.status}`,
      thumbnailUrl: creatives.thumbnailUrl,
      originalFilename: creatives.originalFilename,
      adNameTemplate,
      nameSequence,
    })
    .from(creatives)
    .where(byId(scope, id))
    .limit(1);
  return row ?? null;
}

export type TaggingTarget = NonNullable<
  Awaited<ReturnType<typeof findTaggingTarget>>
>;

export interface AppliedTags {
  tags: AiCreativeTags;
  aiModel: string;
  adNameSuggested: string | null;
}

const unlessEdited = (column: SQLiteColumn, value: string | number) =>
  sql`CASE WHEN ${creatives.tagsEdited} = 1 THEN ${column} ELSE ${value} END`;

export const applyCreativeTags = (
  db: D1Database,
  scope: Scope,
  id: string,
  { tags, aiModel, adNameSuggested }: AppliedTags,
  at: number,
) =>
  updateAndRead(db, scope, id, {
    tagHook: unlessEdited(creatives.tagHook, tags.hook),
    tagAngle: unlessEdited(creatives.tagAngle, tags.angle),
    tagFormat: unlessEdited(creatives.tagFormat, tags.format),
    tagLanguage: unlessEdited(creatives.tagLanguage, tags.language),
    tagOnScreenText: unlessEdited(
      creatives.tagOnScreenText,
      tags.onScreenText ? 1 : 0,
    ),
    tagSummary: unlessEdited(creatives.tagSummary, tags.summary),
    aiStatus: "done",
    aiModel,
    adNameSuggested,
    updatedAt: at,
  });

export const setCreativeAiStatus = (
  db: D1Database,
  scope: Scope,
  id: string,
  aiStatus: CreativeAiStatus,
  at: number,
) => updateAndRead(db, scope, id, { aiStatus, updatedAt: at });

export const launchMediaColumns = {
  kind: sql<CreativeKind | null>`${creatives.kind}`,
  creativeAccountId: creatives.adAccountAssetId,
  metaImageHash: creatives.metaImageHash,
  metaVideoId: creatives.metaVideoId,
  thumbnailUrl: creatives.thumbnailUrl,
};
