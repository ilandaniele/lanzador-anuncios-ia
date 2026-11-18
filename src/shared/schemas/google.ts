import { z } from "zod";
import { CONNECTION_STATUSES } from "../constants";

export const GOOGLE_CONNECT_FAILURES = [
  "STATE_INVALID",
  "GOOGLE_DENIED",
  "TOKEN_EXCHANGE_FAILED",
  "MISSING_PERMISSIONS",
  "INTERNAL",
] as const;
export type GoogleConnectFailure = (typeof GOOGLE_CONNECT_FAILURES)[number];

export const googleConnectRequestSchema = z.object({
  launchId: z.string().min(1).max(64).optional(),
});

export const googleConnectResponseSchema = z.object({
  authorizeUrl: z.url(),
});
export type GoogleConnectResponse = z.infer<typeof googleConnectResponseSchema>;

export const googleConnectionResponseSchema = z.object({
  connected: z.boolean(),
  email: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES).nullable(),
});
export type GoogleConnectionResponse = z.infer<
  typeof googleConnectionResponseSchema
>;

export const pickerTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.iso.datetime(),
  apiKey: z.string(),
  appId: z.string(),
});
export type PickerTokenResponse = z.infer<typeof pickerTokenResponseSchema>;
