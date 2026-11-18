import { COPY_LIMITS } from "../../shared/constants";
import type {
  CopyDto,
  CopyPatch,
  CreateCopyRequest,
  ListCopiesQuery,
} from "../../shared/schemas/copies";
import { decodeNumericCursor, paginate } from "../lib/cursor";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { now } from "../lib/time";
import {
  type CopyRow,
  findCopy,
  insertCopies,
  selectCopies,
  updateCopy,
} from "../repositories/product-copies";
import { findProduct } from "../repositories/products";
import type { Scope } from "../repositories/scope";

type CopyText = {
  primaryText: string;
  headline: string;
  description: string | null;
};

const TEXT_FIELDS = ["primaryText", "headline", "description"] as const;

const toIso = (at: number) => new Date(at).toISOString();

export const toFlag = (value: boolean) => (value ? 1 : 0);

export const toCopyDto = (row: CopyRow): CopyDto => ({
  id: row.id,
  productId: row.productId,
  angle: row.angle,
  customAngle: row.customAngle,
  primaryText: row.primaryText,
  headline: row.headline,
  description: row.description,
  source: row.source,
  edited: row.edited === 1,
  status: row.status,
  favorite: row.favorite === 1,
  policyRisk: row.policyRisk,
  policyNote: row.policyNote,
  overLimit: row.overLimit === 1,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const exceedsCopyLimits = ({
  primaryText,
  headline,
  description,
}: CopyText) =>
  primaryText.length > COPY_LIMITS.primaryText ||
  headline.length > COPY_LIMITS.headline ||
  (description?.length ?? 0) > COPY_LIMITS.description;

export async function assertProductExists(
  db: D1Database,
  scope: Scope,
  productId: string,
) {
  if ((await findProduct(db, scope, productId)) === null) throw notFound();
}

export async function listCopies(
  db: D1Database,
  scope: Scope,
  productId: string,
  { status, favorite, cursor, limit }: ListCopiesQuery,
) {
  await assertProductExists(db, scope, productId);
  const page = paginate(
    await selectCopies(db, scope, {
      productId,
      status,
      favorite,
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.createdAt,
  );
  return { data: page.rows.map(toCopyDto), nextCursor: page.nextCursor };
}

export async function createManualCopy(
  db: D1Database,
  scope: Scope,
  productId: string,
  input: CreateCopyRequest,
) {
  await assertProductExists(db, scope, productId);
  const text = { ...input, description: input.description ?? null };
  const at = now();
  const [copy] = await insertCopies(db, scope, [
    {
      id: newId(),
      productId,
      angle: "manual",
      source: "manual",
      status: "saved",
      overLimit: toFlag(exceedsCopyLimits(text)),
      createdAt: at,
      updatedAt: at,
      ...text,
    },
  ]);
  return { copy: toCopyDto(copy!) };
}

export async function patchCopy(
  db: D1Database,
  scope: Scope,
  copyId: string,
  patch: CopyPatch,
) {
  const current = await findCopy(db, scope, copyId);
  if (!current) throw notFound();
  const textChanged = TEXT_FIELDS.some(
    (field) => patch[field] !== undefined && patch[field] !== current[field],
  );
  const { favorite, ...rest } = patch;
  const copy = await updateCopy(
    db,
    scope,
    copyId,
    {
      ...rest,
      favorite: favorite === undefined ? undefined : toFlag(favorite),
      ...(textChanged
        ? {
            overLimit: toFlag(exceedsCopyLimits({ ...current, ...patch })),
            edited: current.source === "ai" ? 1 : current.edited,
          }
        : {}),
    },
    now(),
  );
  if (!copy) throw notFound();
  return { copy: toCopyDto(copy) };
}
