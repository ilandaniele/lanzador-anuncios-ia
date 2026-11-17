import { and, desc, eq, lt, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";
import { products } from "../../db/schema/products";
import type { Cta, LandingStatus } from "../../shared/constants";
import { inWorkspace, type Scope } from "./scope";

const listColumns = {
  id: products.id,
  name: products.name,
  landingUrl: products.landingUrl,
  headline: products.headline,
  primaryText: products.primaryText,
  cta: sql<Cta>`${products.cta}`,
  landingStatus: sql<LandingStatus>`${products.landingStatus}`,
  priceMinor: products.priceMinor,
  costMinor: products.costMinor,
  archived: products.archived,
  updatedAt: products.updatedAt,
};

const productColumns = {
  ...listColumns,
  description: products.description,
  utm: products.utm,
  currency: products.currency,
  landingHttpStatus: products.landingHttpStatus,
  landingError: products.landingError,
  landingCheckedAt: products.landingCheckedAt,
  createdAt: products.createdAt,
};

export type NewProduct = Omit<
  typeof products.$inferInsert,
  "workspaceId" | "createdBy"
>;

export type ProductChanges = Partial<
  Pick<
    typeof products.$inferInsert,
    | "name"
    | "nameNormalized"
    | "landingUrl"
    | "primaryText"
    | "headline"
    | "description"
    | "cta"
    | "utm"
    | "priceMinor"
    | "costMinor"
    | "currency"
    | "archived"
  >
>;

export type ProductListQuery = {
  q?: string;
  archived: boolean;
  after?: { id: string; sortValue: number };
  size: number;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const nameContains = (q: string) =>
  sql`${products.nameNormalized} LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'`;

const olderThan = ({ id, sortValue }: { id: string; sortValue: number }) =>
  or(
    lt(products.updatedAt, sortValue),
    and(eq(products.updatedAt, sortValue), lt(products.id, id)),
  );

const landingCheckReset = (url: string) => {
  const keepOrReset = (column: SQLiteColumn, reset: SQL) =>
    sql`CASE WHEN ${products.landingUrl} = ${url} THEN ${column} ELSE ${reset} END`;
  return {
    landingStatus: keepOrReset(products.landingStatus, sql`'unchecked'`),
    landingHttpStatus: keepOrReset(products.landingHttpStatus, sql`NULL`),
    landingError: keepOrReset(products.landingError, sql`NULL`),
    landingCheckedAt: keepOrReset(products.landingCheckedAt, sql`NULL`),
  };
};

export const selectProducts = (
  db: D1Database,
  scope: Scope,
  { q, archived, after, size }: ProductListQuery,
) =>
  drizzle(db)
    .select(listColumns)
    .from(products)
    .where(
      and(
        inWorkspace(products, scope),
        eq(products.archived, archived ? 1 : 0),
        q ? nameContains(q) : undefined,
        after ? olderThan(after) : undefined,
      ),
    )
    .orderBy(desc(products.updatedAt), desc(products.id))
    .limit(size + 1);

export type ProductListRow = Awaited<ReturnType<typeof selectProducts>>[number];

export async function findProduct(db: D1Database, scope: Scope, id: string) {
  const [row] = await drizzle(db)
    .select(productColumns)
    .from(products)
    .where(and(inWorkspace(products, scope), eq(products.id, id)))
    .limit(1);
  return row ?? null;
}

export type ProductRow = NonNullable<Awaited<ReturnType<typeof findProduct>>>;

export async function insertProduct(
  db: D1Database,
  scope: Scope,
  row: NewProduct,
): Promise<ProductRow> {
  const [inserted] = await drizzle(db)
    .insert(products)
    .values({ ...row, workspaceId: scope.workspaceId, createdBy: scope.userId })
    .returning(productColumns);
  return inserted!;
}

export async function updateProduct(
  db: D1Database,
  scope: Scope,
  id: string,
  changes: ProductChanges,
  at: number,
): Promise<ProductRow | null> {
  const [row] = await drizzle(db)
    .update(products)
    .set({
      ...changes,
      ...(changes.landingUrl === undefined
        ? {}
        : landingCheckReset(changes.landingUrl)),
      updatedAt: at,
    })
    .where(and(inWorkspace(products, scope), eq(products.id, id)))
    .returning(productColumns);
  return row ?? null;
}
