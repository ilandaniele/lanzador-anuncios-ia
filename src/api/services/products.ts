import type {
  CreateProductRequest,
  ListProductsQuery,
  ProductPatch,
} from "../../shared/schemas/products";
import { decodeNumericCursor, paginate } from "../lib/cursor";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { now } from "../lib/time";
import {
  findProduct,
  insertProduct,
  selectProducts,
  updateProduct,
} from "../repositories/products";
import type { Scope } from "../repositories/scope";
import { toProductDto, toProductListItem } from "./product-dto";
import {
  assertHttpsLanding,
  normalizeProductName,
  rethrowProductWriteError,
} from "./product-rules";

const COPY_SUFFIX = " (copia)";

async function findProductOrThrow(db: D1Database, scope: Scope, id: string) {
  const product = await findProduct(db, scope, id);
  if (!product) throw notFound();
  return product;
}

export async function listProducts(
  db: D1Database,
  scope: Scope,
  { q, archived, cursor, limit }: ListProductsQuery,
) {
  const page = paginate(
    await selectProducts(db, scope, {
      q: q ? normalizeProductName(q) : undefined,
      archived,
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.updatedAt,
  );
  return {
    data: page.rows.map(toProductListItem),
    nextCursor: page.nextCursor,
  };
}

export async function createProduct(
  db: D1Database,
  scope: Scope,
  input: CreateProductRequest,
) {
  assertHttpsLanding(input.landingUrl);
  const at = now();
  const product = await insertProduct(db, scope, {
    ...input,
    id: newId(),
    nameNormalized: normalizeProductName(input.name),
    createdAt: at,
    updatedAt: at,
  }).catch(rethrowProductWriteError);
  return { product: toProductDto(product) };
}

export async function getProduct(db: D1Database, scope: Scope, id: string) {
  return { product: toProductDto(await findProductOrThrow(db, scope, id)) };
}

export async function patchProduct(
  db: D1Database,
  scope: Scope,
  id: string,
  patch: ProductPatch,
) {
  if (patch.landingUrl !== undefined) assertHttpsLanding(patch.landingUrl);
  const changes = {
    ...patch,
    ...(patch.name === undefined
      ? {}
      : { nameNormalized: normalizeProductName(patch.name) }),
  };
  const product = await updateProduct(db, scope, id, changes, now()).catch(
    rethrowProductWriteError,
  );
  if (!product) throw notFound();
  return { product: toProductDto(product) };
}

export async function duplicateProduct(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const source = await findProductOrThrow(db, scope, id);
  const name = `${source.name}${COPY_SUFFIX}`;
  const at = now();
  const product = await insertProduct(db, scope, {
    id: newId(),
    name,
    nameNormalized: normalizeProductName(name),
    landingUrl: source.landingUrl,
    primaryText: source.primaryText,
    headline: source.headline,
    description: source.description,
    cta: source.cta,
    utm: source.utm,
    priceMinor: source.priceMinor,
    costMinor: source.costMinor,
    currency: source.currency,
    createdAt: at,
    updatedAt: at,
  }).catch(rethrowProductWriteError);
  return { product: toProductDto(product) };
}

export async function archiveProduct(
  db: D1Database,
  scope: Scope,
  id: string,
  archived: boolean,
) {
  const product = await updateProduct(
    db,
    scope,
    id,
    { archived: archived ? 1 : 0 },
    now(),
  );
  if (!product) throw notFound();
  return { product: toProductDto(product) };
}
