import { z } from "zod";
import { ROLES, WORKSPACE_STATUSES } from "../constants";

const EMAIL_MAX = 254;
const TOKEN_MAX = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX)
  .pipe(z.email());

export const magicLinkRequestSchema = z.object({ email: emailSchema });
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export const verifyRequestSchema = z.object({
  token: z.string().min(1).max(TOKEN_MAX),
});
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

export const reviewerLinkRequestSchema = z.object({
  code: z.string().min(1).max(TOKEN_MAX),
});
export type ReviewerLinkRequest = z.infer<typeof reviewerLinkRequestSchema>;

export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    isSuperadmin: z.boolean(),
  }),
  workspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(ROLES),
      status: z.enum(WORKSPACE_STATUSES),
    }),
  ),
});
export type Me = z.infer<typeof meSchema>;
