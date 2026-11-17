import { z } from "zod";
import { CTAS, LANDING_STATUSES } from "../constants";
import {
  currencySchema,
  paginatedSchema,
  paginationQuerySchema,
} from "./common";

const NAME_MAX = 120;
const URL_MAX = 2048;
const PRIMARY_TEXT_MAX = 2000;
const HEADLINE_MAX = 255;
const DESCRIPTION_MAX = 255;
const UTM_MAX = 500;

const text = (max: number) => z.string().trim().min(1).max(max);

const productFields = {
  name: text(NAME_MAX),
  landingUrl: z.string().trim().max(URL_MAX),
  primaryText: text(PRIMARY_TEXT_MAX),
  headline: text(HEADLINE_MAX),
  description: text(DESCRIPTION_MAX).nullish(),
  cta: z.enum(CTAS),
  utm: text(UTM_MAX)
    .regex(/^[\w.~%+=&{}-]+$/)
    .nullish(),
  priceMinor: z.int().positive().nullish(),
  costMinor: z.int().min(0).nullish(),
  currency: currencySchema,
};

export const createProductRequestSchema = z.object(productFields);
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const productPatchSchema = z
  .object(productFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type ProductPatch = z.infer<typeof productPatchSchema>;

export const archiveProductRequestSchema = z.object({ archived: z.boolean() });

export const listProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(NAME_MAX).optional(),
  archived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  landingUrl: z.string(),
  headline: z.string(),
  primaryText: z.string(),
  cta: z.enum(CTAS),
  landingStatus: z.enum(LANDING_STATUSES),
  breakEvenRoas: z.number().nullable(),
  archived: z.boolean(),
});
export type ProductListItemDto = z.infer<typeof productListItemSchema>;

export const productsPageSchema = paginatedSchema(productListItemSchema);

export const productSchema = productListItemSchema.extend({
  description: z.string().nullable(),
  utm: z.string().nullable(),
  priceMinor: z.number().nullable(),
  costMinor: z.number().nullable(),
  currency: z.string(),
  profitPerSaleMinor: z.number().nullable(),
  landingHttpStatus: z.number().nullable(),
  landingError: z.string().nullable(),
  landingCheckedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProductDto = z.infer<typeof productSchema>;

export const productResponseSchema = z.object({ product: productSchema });
