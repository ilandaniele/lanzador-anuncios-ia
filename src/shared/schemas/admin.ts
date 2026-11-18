import { z } from "zod";
import {
  CONNECTION_STATUSES,
  ERROR_SOURCES,
  WORKSPACE_STATUSES,
} from "../constants";
import { emailSchema } from "./auth";
import { paginatedSchema, paginationQuerySchema } from "./common";

const DISABLED_REASON_MAX = 500;
const PLAN_ID_MAX = 64;
const NOTE_MAX = 500;

const workspaceStatusSchema = z.enum(WORKSPACE_STATUSES);

export const adminWorkspacesQuerySchema = paginationQuerySchema.extend({
  status: workspaceStatusSchema.optional(),
});
export type AdminWorkspacesQuery = z.infer<typeof adminWorkspacesQuerySchema>;

export const adminWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: workspaceStatusSchema,
  planId: z.string(),
  ownerEmail: z.string(),
  metaStatus: z.enum(CONNECTION_STATUSES).nullable(),
  memberCount: z.number(),
  lastActivityAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  aiNeuronsMonth: z.number(),
});
export type AdminWorkspaceDto = z.infer<typeof adminWorkspaceSchema>;

export const adminWorkspacesPageSchema = paginatedSchema(adminWorkspaceSchema);

export const adminWorkspaceResponseSchema = z.object({
  workspace: adminWorkspaceSchema,
});

const neuronsOverrideSchema = z.int().min(0).nullable().optional();

export const patchAdminWorkspaceSchema = z
  .object({
    status: workspaceStatusSchema.exclude(["deleting"]).optional(),
    disabledReason: z
      .string()
      .trim()
      .min(1)
      .max(DISABLED_REASON_MAX)
      .optional(),
    planId: z.string().min(1).max(PLAN_ID_MAX).optional(),
    aiDailyNeuronsOverride: neuronsOverrideSchema,
    aiMonthlyNeuronsOverride: neuronsOverrideSchema,
  })
  .refine((patch) => Object.keys(patch).length > 0)
  .refine(
    (patch) =>
      patch.disabledReason === undefined || patch.status === "disabled",
  );
export type PatchAdminWorkspace = z.infer<typeof patchAdminWorkspaceSchema>;

export const betaInviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  note: z.string().nullable(),
  usedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type BetaInviteDto = z.infer<typeof betaInviteSchema>;

export const betaInvitesPageSchema = paginatedSchema(betaInviteSchema);

export const betaInviteResponseSchema = z.object({ invite: betaInviteSchema });

export const createBetaInviteRequestSchema = z.object({
  email: emailSchema,
  note: z.string().trim().min(1).max(NOTE_MAX).optional(),
});
export type CreateBetaInviteRequest = z.infer<
  typeof createBetaInviteRequestSchema
>;

export const adminUsageQuerySchema = paginationQuerySchema.extend({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type AdminUsageQuery = z.infer<typeof adminUsageQuerySchema>;

export const adminUsageSchema = z.object({
  workspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      neurons: z.number(),
      metaCalls: z.number(),
    }),
  ),
  global: z.object({ neuronsToday: z.number() }),
  nextCursor: z.string().nullable(),
});
export type AdminUsageDto = z.infer<typeof adminUsageSchema>;

const errorSourceSchema = z.enum(ERROR_SOURCES);

export const adminErrorsQuerySchema = paginationQuerySchema.extend({
  source: errorSourceSchema.optional(),
});
export type AdminErrorsQuery = z.infer<typeof adminErrorsQuerySchema>;

export const adminErrorSchema = z.object({
  id: z.string(),
  source: errorSourceSchema,
  route: z.string().nullable(),
  status: z.number().nullable(),
  code: z.string().nullable(),
  message: z.string(),
  workspaceId: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminErrorDto = z.infer<typeof adminErrorSchema>;

export const adminErrorsPageSchema = paginatedSchema(adminErrorSchema);
