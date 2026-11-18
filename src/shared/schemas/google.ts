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

export const DRIVE_IMPORT_MAX_FILES = 30;
export const DRIVE_IMPORT_MAX_IN_FLIGHT = 60;

export const driveFileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,128}$/);

const driveFileSchema = z.object({
  id: driveFileIdSchema,
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().toLowerCase().max(100),
  sizeBytes: z.int().positive(),
});

export const driveImportRequestSchema = z.object({
  adAccountAssetId: z.string().min(1).max(64),
  files: z.array(driveFileSchema).min(1).max(DRIVE_IMPORT_MAX_FILES),
});
export type DriveImportRequest = z.infer<typeof driveImportRequestSchema>;

export const driveImportResponseSchema = z.object({
  data: z.array(
    z.object({ creativeId: z.string(), status: z.literal("importing") }),
  ),
});
export type DriveImportResponse = z.infer<typeof driveImportResponseSchema>;
