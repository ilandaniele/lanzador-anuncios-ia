import { z } from "zod";
import {
  COPY_ANGLES,
  COPY_GENERATE_ANGLES,
  COPY_POLICY_RISKS,
  COPY_SOURCES,
  COPY_STATUSES,
  COPY_VARIANTS_PER_GENERATION,
} from "../constants";
import { paginatedSchema, paginationQuerySchema } from "./common";

const PRIMARY_TEXT_MAX = 2000;
const HEADLINE_MAX = 255;
const DESCRIPTION_MAX = 255;
export const CUSTOM_ANGLE_MAX = 200;

const text = (max: number) => z.string().trim().min(1).max(max);

export const generateCopiesRequestSchema = z.object({
  angle: z.enum(COPY_GENERATE_ANGLES),
  customAngle: text(CUSTOM_ANGLE_MAX).optional(),
});
export type GenerateCopiesRequest = z.infer<typeof generateCopiesRequestSchema>;

export const createCopyRequestSchema = z.object({
  primaryText: text(PRIMARY_TEXT_MAX),
  headline: text(HEADLINE_MAX),
  description: text(DESCRIPTION_MAX).nullish(),
});
export type CreateCopyRequest = z.infer<typeof createCopyRequestSchema>;

export const copyPatchSchema = z
  .object({
    primaryText: text(PRIMARY_TEXT_MAX),
    headline: text(HEADLINE_MAX),
    description: text(DESCRIPTION_MAX).nullable(),
    favorite: z.boolean(),
    status: z.enum(["saved", "discarded"]),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type CopyPatch = z.infer<typeof copyPatchSchema>;

export const listCopiesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(COPY_STATUSES).optional(),
  favorite: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type ListCopiesQuery = z.infer<typeof listCopiesQuerySchema>;

export const copySchema = z.object({
  id: z.string(),
  productId: z.string(),
  angle: z.enum(COPY_ANGLES),
  customAngle: z.string().nullable(),
  primaryText: z.string(),
  headline: z.string(),
  description: z.string().nullable(),
  source: z.enum(COPY_SOURCES),
  edited: z.boolean(),
  status: z.enum(COPY_STATUSES),
  favorite: z.boolean(),
  policyRisk: z.enum(COPY_POLICY_RISKS),
  policyNote: z.string().nullable(),
  overLimit: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CopyDto = z.infer<typeof copySchema>;

export const copyResponseSchema = z.object({ copy: copySchema });
export const copiesPageSchema = paginatedSchema(copySchema);
export const generatedCopiesSchema = z.object({ data: z.array(copySchema) });

const aiText = z.string().trim();

export const aiCopyVariantsSchema = z.object({
  variants: z
    .array(
      z.object({
        primaryText: aiText.min(1),
        headline: aiText.min(1),
        description: aiText.nullish(),
        policyRisk: z.enum(COPY_POLICY_RISKS),
        policyNote: aiText.nullish(),
      }),
    )
    .min(COPY_VARIANTS_PER_GENERATION),
});
export type AiCopyVariant = z.infer<
  typeof aiCopyVariantsSchema
>["variants"][number];
