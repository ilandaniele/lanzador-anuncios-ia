import type {
  ProductDto,
  ProductListItemDto,
} from "../../shared/schemas/products";
import { toIsoOrNull } from "../lib/time";
import type { ProductListRow, ProductRow } from "../repositories/products";
import { breakEvenRoas, profitPerSaleMinor } from "./break-even";

export const toProductListItem = (row: ProductListRow): ProductListItemDto => ({
  id: row.id,
  name: row.name,
  landingUrl: row.landingUrl,
  headline: row.headline,
  primaryText: row.primaryText,
  cta: row.cta,
  landingStatus: row.landingStatus,
  breakEvenRoas: breakEvenRoas(row.priceMinor, row.costMinor),
  archived: row.archived === 1,
});

export const toProductDto = (row: ProductRow): ProductDto => ({
  ...toProductListItem(row),
  description: row.description,
  utm: row.utm,
  priceMinor: row.priceMinor,
  costMinor: row.costMinor,
  currency: row.currency,
  profitPerSaleMinor: profitPerSaleMinor(row.priceMinor, row.costMinor),
  landingHttpStatus: row.landingHttpStatus,
  landingError: row.landingError,
  landingCheckedAt: toIsoOrNull(row.landingCheckedAt),
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
});
