import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { productCopies } from "../../db/schema/products";
import type {
  CopyAngle,
  CopyPolicyRisk,
  COPY_SOURCES,
  COPY_STATUSES,
} from "../../shared/constants";
import { inWorkspace, type Scope } from "./scope";

const copyColumns = {
  id: productCopies.id,
  productId: productCopies.productId,
  angle: sql<CopyAngle>`${productCopies.angle}`,
  customAngle: productCopies.customAngle,
  primaryText: productCopies.primaryText,
  headline: productCopies.headline,
  description: productCopies.description,
  source: sql<(typeof COPY_SOURCES)[number]>`${productCopies.source}`,
  edited: productCopies.edited,
  status: sql<(typeof COPY_STATUSES)[number]>`${productCopies.status}`,
  favorite: productCopies.favorite,
  policyRisk: sql<CopyPolicyRisk>`${productCopies.policyRisk}`,
  policyNote: productCopies.policyNote,
  overLimit: productCopies.overLimit,
  createdAt: productCopies.createdAt,
  updatedAt: productCopies.updatedAt,
};

export type NewCopy = Omit<
  typeof productCopies.$inferInsert,
  "workspaceId" | "createdBy"
>;

export type CopyChanges = Partial<
  Pick<
    typeof productCopies.$inferInsert,
    | "primaryText"
    | "headline"
    | "description"
    | "favorite"
    | "status"
    | "edited"
    | "overLimit"
  >
>;

export type CopyListQuery = {
  productId: string;
  status?: (typeof COPY_STATUSES)[number];
  favorite?: boolean;
  after?: { id: string; sortValue: number };
  size: number;
};

const createdBefore = ({ id, sortValue }: { id: string; sortValue: number }) =>
  or(
    lt(productCopies.createdAt, sortValue),
    and(eq(productCopies.createdAt, sortValue), lt(productCopies.id, id)),
  );

export const selectCopies = (
  db: D1Database,
  scope: Scope,
  { productId, status, favorite, after, size }: CopyListQuery,
) =>
  drizzle(db)
    .select(copyColumns)
    .from(productCopies)
    .where(
      and(
        inWorkspace(productCopies, scope),
        eq(productCopies.productId, productId),
        status ? eq(productCopies.status, status) : undefined,
        favorite === undefined
          ? undefined
          : eq(productCopies.favorite, favorite ? 1 : 0),
        after ? createdBefore(after) : undefined,
      ),
    )
    .orderBy(desc(productCopies.createdAt), desc(productCopies.id))
    .limit(size + 1);

export type CopyRow = Awaited<ReturnType<typeof selectCopies>>[number];

export async function findCopy(
  db: D1Database,
  scope: Scope,
  id: string,
): Promise<CopyRow | null> {
  const [row] = await drizzle(db)
    .select(copyColumns)
    .from(productCopies)
    .where(and(inWorkspace(productCopies, scope), eq(productCopies.id, id)))
    .limit(1);
  return row ?? null;
}

export const insertCopies = (db: D1Database, scope: Scope, rows: NewCopy[]) =>
  drizzle(db)
    .insert(productCopies)
    .values(
      rows.map((row) => ({
        ...row,
        workspaceId: scope.workspaceId,
        createdBy: scope.userId,
      })),
    )
    .returning(copyColumns);

export async function updateCopy(
  db: D1Database,
  scope: Scope,
  id: string,
  changes: CopyChanges,
  at: number,
): Promise<CopyRow | null> {
  const [row] = await drizzle(db)
    .update(productCopies)
    .set({ ...changes, updatedAt: at })
    .where(and(inWorkspace(productCopies, scope), eq(productCopies.id, id)))
    .returning(copyColumns);
  return row ?? null;
}
