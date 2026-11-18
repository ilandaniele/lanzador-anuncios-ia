import type {
  LaunchSource,
  ListLaunchesQuery,
  PartialLaunchDraft,
} from "../../../shared/schemas/launch";
import { decodeNumericCursor, paginate } from "../../lib/cursor";
import { conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import {
  discardEditableLaunch,
  findDraftReferences,
  findLaunchStatus,
  findLaunchWithItems,
  insertLaunch,
  selectLaunches,
  updateEditableLaunch,
} from "../../repositories/launches";
import type { Scope } from "../../repositories/scope";
import { toLaunchDetail, toLaunchDto, toLaunchListItem } from "./launch-dto";

async function toDraftColumns(
  db: D1Database,
  scope: Scope,
  draft: PartialLaunchDraft,
) {
  const { product, adAccount } = await findDraftReferences(db, scope, draft);
  if ((draft.productId && !product) || (draft.adAccountAssetId && !adAccount)) {
    throw notFound();
  }
  return {
    mode: draft.mode ?? null,
    adAccountAssetId: adAccount?.id ?? null,
    adAccountMetaId: adAccount?.metaId ?? null,
    currency: adAccount?.currency ?? null,
    productId: product?.id ?? null,
    draft: JSON.stringify(draft),
    dailyBudgetMinor: draft.dailyBudgetMinor ?? null,
  };
}

export async function throwWhyNotEditable(
  db: D1Database,
  scope: Scope,
  id: string,
): Promise<never> {
  if ((await findLaunchStatus(db, scope, id)) === null) throw notFound();
  throw conflict("NOT_EDITABLE");
}

export async function listLaunches(
  db: D1Database,
  scope: Scope,
  { status, cursor, limit }: ListLaunchesQuery,
) {
  const page = paginate(
    await selectLaunches(db, scope, {
      status,
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.createdAt,
  );
  return { data: page.rows.map(toLaunchListItem), nextCursor: page.nextCursor };
}

export async function createLaunchDraft(
  db: D1Database,
  scope: Scope,
  draft: PartialLaunchDraft,
  source: LaunchSource = "manual",
) {
  const at = now();
  const launch = await insertLaunch(db, scope, {
    ...(await toDraftColumns(db, scope, draft)),
    id: newId(),
    source,
    createdAt: at,
    updatedAt: at,
  });
  return { launch: toLaunchDto(launch) };
}

export async function getLaunch(db: D1Database, scope: Scope, id: string) {
  const found = await findLaunchWithItems(db, scope, id);
  if (!found) throw notFound();
  return toLaunchDetail(found.launch, found.items);
}

export async function patchLaunchDraft(
  db: D1Database,
  scope: Scope,
  id: string,
  draft: PartialLaunchDraft,
) {
  const launch = await updateEditableLaunch(
    db,
    scope,
    id,
    await toDraftColumns(db, scope, draft),
    now(),
  );
  if (!launch) return throwWhyNotEditable(db, scope, id);
  return { launch: toLaunchDto(launch) };
}

export async function discardLaunch(db: D1Database, scope: Scope, id: string) {
  if (!(await discardEditableLaunch(db, scope, id, now()))) {
    await throwWhyNotEditable(db, scope, id);
  }
}
