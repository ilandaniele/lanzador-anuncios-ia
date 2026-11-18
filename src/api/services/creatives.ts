import type {
  CreativeDto,
  CreativePatch,
  CreativeStatus,
  ListCreativesQuery,
} from "../../shared/schemas/creatives";
import { decodeNumericCursor, paginate } from "../lib/cursor";
import { conflict, notFound } from "../lib/errors";
import { now } from "../lib/time";
import {
  type CreativeChanges,
  type CreativeRow,
  findCreative,
  selectCreatives,
  setCreativeArchived,
  updateCreative,
} from "../repositories/creatives";
import type { Scope } from "../repositories/scope";

const LIBRARY_STATUSES: CreativeStatus[] = ["ready", "processing", "importing"];

const toBooleanOrNull = (value: number | null) =>
  value === null ? null : value === 1;

const toFlagOrNull = (value: boolean | null) =>
  value === null ? null : value ? 1 : 0;

export const toCreativeDto = (row: CreativeRow): CreativeDto => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  status: row.status,
  adAccountAssetId: row.adAccountAssetId,
  thumbnailUrl: row.thumbnailUrl,
  formatWarning: row.formatWarning,
  tags: {
    hook: row.tagHook,
    angle: row.tagAngle,
    format: row.tagFormat,
    language: row.tagLanguage,
    onScreenText: toBooleanOrNull(row.tagOnScreenText),
  },
  aiStatus: row.aiStatus,
  usedInLaunches: row.usedInLaunches,
  createdAt: new Date(row.createdAt).toISOString(),
});

const creativeOrThrow = (row: CreativeRow | null) => {
  if (!row) throw notFound();
  return { creative: toCreativeDto(row) };
};

export async function listCreatives(
  db: D1Database,
  scope: Scope,
  { ids, status, cursor, limit, sort, ...filters }: ListCreativesQuery,
) {
  const page = paginate(
    await selectCreatives(db, scope, {
      ...filters,
      ids,
      statuses: status ?? (ids ? undefined : LIBRARY_STATUSES),
      sort,
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => (sort === "most_used" ? row.usedInLaunches : row.createdAt),
  );
  return { data: page.rows.map(toCreativeDto), nextCursor: page.nextCursor };
}

export async function getCreative(db: D1Database, scope: Scope, id: string) {
  return creativeOrThrow(await findCreative(db, scope, id));
}

const toChanges = ({ name, tags }: CreativePatch): CreativeChanges => ({
  ...(name === undefined ? {} : { adName: name }),
  ...(tags === undefined
    ? {}
    : {
        tagHook: tags.hook,
        tagAngle: tags.angle,
        tagFormat: tags.format,
        tagLanguage: tags.language,
        tagOnScreenText: toFlagOrNull(tags.onScreenText),
        tagsEdited: 1,
      }),
});

export async function patchCreative(
  db: D1Database,
  scope: Scope,
  id: string,
  patch: CreativePatch,
) {
  return creativeOrThrow(
    await updateCreative(db, scope, id, toChanges(patch), now()),
  );
}

export async function archiveCreative(
  db: D1Database,
  scope: Scope,
  id: string,
  archived: boolean,
) {
  const row = await setCreativeArchived(db, scope, id, archived, now());
  if (row && archived && row.status !== "archived") {
    throw conflict("CREATIVE_NOT_READY");
  }
  return creativeOrThrow(row);
}
