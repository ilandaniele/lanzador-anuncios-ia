import { z } from "zod";

export const META_CONNECT_FAILURES = [
  "STATE_INVALID",
  "META_DENIED",
  "TOKEN_EXCHANGE_FAILED",
  "MISSING_PERMISSIONS",
  "META_ERROR",
  "INTERNAL",
] as const;
export type MetaConnectFailure = (typeof META_CONNECT_FAILURES)[number];

const param = z.string().min(1).max(2048).optional();

export const metaCallbackQuerySchema = z.object({
  state: param,
  code: param,
  error: param,
});
export type MetaCallbackQuery = z.infer<typeof metaCallbackQuerySchema>;

export const metaConnectResponseSchema = z.object({
  authorizeUrl: z.url(),
});
export type MetaConnectResponse = z.infer<typeof metaConnectResponseSchema>;
