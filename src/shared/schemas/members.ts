import { z } from "zod";
import { INVITABLE_ROLES, ROLES } from "../constants";
import { paginatedSchema } from "./common";
import { workspaceSchema } from "./workspaces";

export const memberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(ROLES),
  joinedAt: z.iso.datetime(),
});
export type MemberDto = z.infer<typeof memberSchema>;

export const membersPageSchema = paginatedSchema(memberSchema);

export const memberResponseSchema = z.object({ member: memberSchema });

export const memberRoleRequestSchema = z.object({
  role: z.enum(INVITABLE_ROLES),
});

export const transferOwnershipRequestSchema = z.object({
  userId: z.string().min(1),
  confirm: z.literal(true),
});

export const transferOwnershipResponseSchema = z.object({
  workspace: workspaceSchema,
});
