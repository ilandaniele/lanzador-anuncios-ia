import { z } from "zod";
import { AUDIT_ORIGINS, AUDIT_RESULTS } from "../constants";
import { paginatedSchema, paginationQuerySchema } from "./common";

const FILTER_MAX = 200;

const filter = z.string().trim().min(1).max(FILTER_MAX);

export const listAuditQuerySchema = paginationQuerySchema
  .extend({
    origin: z.enum(AUDIT_ORIGINS).optional(),
    action: filter.optional(),
    objectId: filter.optional(),
    actorUserId: filter.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to));
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  actorEmail: z.string().nullable(),
  origin: z.enum(AUDIT_ORIGINS),
  action: z.string(),
  objectType: z.string().nullable(),
  objectId: z.string().nullable(),
  objectName: z.string().nullable(),
  result: z.enum(AUDIT_RESULTS),
  detail: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = paginatedSchema(auditEntrySchema);
