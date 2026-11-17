import { z } from "zod";
import { INVITABLE_ROLES, INVITATION_STATUSES, ROLES } from "../constants";
import { emailSchema, verifyRequestSchema } from "./auth";
import { paginatedSchema } from "./common";

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(INVITABLE_ROLES),
  expiresAt: z.iso.datetime(),
  status: z.enum(INVITATION_STATUSES),
});
export type InvitationDto = z.infer<typeof invitationSchema>;

export const invitationsPageSchema = paginatedSchema(invitationSchema);

export const invitationResponseSchema = z.object({
  invitation: invitationSchema,
});

export const createInvitationRequestSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITABLE_ROLES),
});
export type CreateInvitationRequest = z.infer<
  typeof createInvitationRequestSchema
>;

export const acceptInvitationRequestSchema = verifyRequestSchema;

export const acceptInvitationResponseSchema = z.object({
  workspaceId: z.string(),
  role: z.enum(ROLES),
});
export type AcceptInvitationResponse = z.infer<
  typeof acceptInvitationResponseSchema
>;
