import { z } from "zod";
import { PAGINATION } from "../constants";
import { type ErrorCode, isErrorCode } from "../errors";

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxLimit)
    .default(PAGINATION.defaultLimit),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedSchema = <Item extends z.ZodType>(item: Item) =>
  z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.custom<ErrorCode>(isErrorCode),
    message: z.string(),
    requestId: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
