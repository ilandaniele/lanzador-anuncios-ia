import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { launchItems, launches } from "../../db/schema/launches";
import { metaAssets } from "../../db/schema/meta";
import { products } from "../../db/schema/products";
import type {
  LaunchItemSource,
  LaunchItemStatus,
  LaunchMode,
  LaunchPhase,
  LaunchSource,
  LaunchStatus,
} from "../../shared/schemas/launch";
import { inWorkspace, type Scope } from "./scope";

const EDITABLE_STATUSES = ["draft", "simulated"];

const listColumns = {
  id: launches.id,
  status: sql<LaunchStatus>`${launches.status}`,
  source: sql<LaunchSource>`${launches.source}`,
  productName: products.name,
  adAccountName: metaAssets.name,
  campaignName: sql<
    string | null
  >`json_extract(${launches.draft}, '$.campaignName')`,
  adAccountMetaId: launches.adAccountMetaId,
  metaCampaignId: launches.metaCampaignId,
  itemsTotal: launches.itemsTotal,
  itemsDone: launches.itemsDone,
  itemsFailed: launches.itemsFailed,
  createdBy: launches.createdBy,
  createdAt: launches.createdAt,
};

const launchColumns = {
  id: launches.id,
  status: sql<LaunchStatus>`${launches.status}`,
  phase: sql<LaunchPhase | null>`${launches.phase}`,
  source: sql<LaunchSource>`${launches.source}`,
  mode: sql<LaunchMode | null>`${launches.mode}`,
  adAccountAssetId: launches.adAccountAssetId,
  adAccountMetaId: launches.adAccountMetaId,
  currency: launches.currency,
  productId: launches.productId,
  draft: launches.draft,
  plan: launches.plan,
  planHash: launches.planHash,
  dailyBudgetMinor: launches.dailyBudgetMinor,
  startAt: launches.startAt,
  metaCampaignId: launches.metaCampaignId,
  itemsTotal: launches.itemsTotal,
  itemsDone: launches.itemsDone,
  itemsFailed: launches.itemsFailed,
  checks: launches.checks,
  checksOk: launches.checksOk,
  errorCode: launches.errorCode,
  errorMessage: launches.errorMessage,
  createdBy: launches.createdBy,
  createdAt: launches.createdAt,
  startedAt: launches.startedAt,
  finishedAt: launches.finishedAt,
  activatedAt: launches.activatedAt,
  updatedAt: launches.updatedAt,
};

const itemColumns = {
  id: launchItems.id,
  position: launchItems.position,
  status: sql<LaunchItemStatus>`${launchItems.status}`,
  source: sql<LaunchItemSource>`${launchItems.source}`,
  creativeId: launchItems.creativeId,
  adName: launchItems.adName,
  metaAdId: launchItems.metaAdId,
  errorCode: launchItems.errorCode,
  errorMessage: launchItems.errorMessage,
};

export type NewLaunch = Pick<
  typeof launches.$inferInsert,
  | "id"
  | "mode"
  | "adAccountAssetId"
  | "adAccountMetaId"
  | "currency"
  | "productId"
  | "draft"
  | "dailyBudgetMinor"
  | "createdAt"
  | "updatedAt"
>;

export type LaunchDraftColumns = Omit<
  NewLaunch,
  "id" | "createdAt" | "updatedAt"
>;

export type DraftReferenceIds = {
  productId?: string;
  adAccountAssetId?: string;
};

export type LaunchListQuery = {
  status?: LaunchStatus;
  after?: { id: string; sortValue: number };
  size: number;
};

const olderThan = ({ id, sortValue }: { id: string; sortValue: number }) =>
  or(
    lt(launches.createdAt, sortValue),
    and(eq(launches.createdAt, sortValue), lt(launches.id, id)),
  );

export const selectLaunches = (
  db: D1Database,
  scope: Scope,
  { status, after, size }: LaunchListQuery,
) =>
  drizzle(db)
    .select(listColumns)
    .from(launches)
    .leftJoin(
      products,
      and(
        eq(products.id, launches.productId),
        eq(products.workspaceId, launches.workspaceId),
      ),
    )
    .leftJoin(
      metaAssets,
      and(
        eq(metaAssets.id, launches.adAccountAssetId),
        eq(metaAssets.workspaceId, launches.workspaceId),
      ),
    )
    .where(
      and(
        inWorkspace(launches, scope),
        status ? eq(launches.status, status) : undefined,
        after ? olderThan(after) : undefined,
      ),
    )
    .orderBy(desc(launches.createdAt), desc(launches.id))
    .limit(size + 1);

export type LaunchListRow = Awaited<ReturnType<typeof selectLaunches>>[number];

export async function findLaunchWithItems(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const orm = drizzle(db);
  const [[launch], items] = await orm.batch([
    orm
      .select(launchColumns)
      .from(launches)
      .where(and(inWorkspace(launches, scope), eq(launches.id, id)))
      .limit(1),
    orm
      .select(itemColumns)
      .from(launchItems)
      .where(and(inWorkspace(launchItems, scope), eq(launchItems.launchId, id)))
      .orderBy(launchItems.position),
  ]);
  return launch ? { launch, items } : null;
}

export type LaunchRow = NonNullable<
  Awaited<ReturnType<typeof findLaunchWithItems>>
>["launch"];
export type LaunchItemRow = NonNullable<
  Awaited<ReturnType<typeof findLaunchWithItems>>
>["items"][number];

export async function findLaunchStatus(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({ status: launches.status })
    .from(launches)
    .where(and(inWorkspace(launches, scope), eq(launches.id, id)))
    .limit(1);
  return row?.status ?? null;
}

export async function findDraftReferences(
  db: D1Database,
  scope: Scope,
  { productId = "", adAccountAssetId = "" }: DraftReferenceIds,
) {
  const orm = drizzle(db);
  const [[product], [adAccount]] = await orm.batch([
    orm
      .select({ id: products.id })
      .from(products)
      .where(and(inWorkspace(products, scope), eq(products.id, productId)))
      .limit(1),
    orm
      .select({
        id: metaAssets.id,
        metaId: metaAssets.metaId,
        currency: metaAssets.currency,
      })
      .from(metaAssets)
      .where(
        and(
          inWorkspace(metaAssets, scope),
          eq(metaAssets.kind, "ad_account"),
          eq(metaAssets.id, adAccountAssetId),
        ),
      )
      .limit(1),
  ]);
  return { product, adAccount };
}

export async function insertLaunch(
  db: D1Database,
  scope: Scope,
  row: NewLaunch,
) {
  const [inserted] = await drizzle(db)
    .insert(launches)
    .values({ ...row, workspaceId: scope.workspaceId, createdBy: scope.userId })
    .returning(launchColumns);
  return inserted!;
}

export async function updateEditableLaunch(
  db: D1Database,
  scope: Scope,
  id: string,
  changes: LaunchDraftColumns,
  at: number,
) {
  const [row] = await drizzle(db)
    .update(launches)
    .set({
      ...changes,
      status: "draft",
      plan: null,
      planHash: null,
      updatedAt: at,
    })
    .where(
      and(
        inWorkspace(launches, scope),
        eq(launches.id, id),
        inArray(launches.status, EDITABLE_STATUSES),
      ),
    )
    .returning(launchColumns);
  return row ?? null;
}

export async function discardEditableLaunch(
  db: D1Database,
  scope: Scope,
  id: string,
  at: number,
) {
  const rows = await drizzle(db)
    .update(launches)
    .set({ status: "discarded", updatedAt: at })
    .where(
      and(
        inWorkspace(launches, scope),
        eq(launches.id, id),
        inArray(launches.status, EDITABLE_STATUSES),
      ),
    )
    .returning({ id: launches.id });
  return rows.length === 1;
}
