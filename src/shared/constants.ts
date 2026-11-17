export const ROLES = ["viewer", "editor", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const CTAS = [
  "SHOP_NOW",
  "LEARN_MORE",
  "ORDER_NOW",
  "BUY_NOW",
  "GET_OFFER",
  "SIGN_UP",
] as const;
export type Cta = (typeof CTAS)[number];
export const DEFAULT_CTA: Cta = "SHOP_NOW";

export const COPY_LIMITS = {
  headline: 40,
  primaryText: 125,
  description: 150,
} as const;

const MIB = 1024 * 1024;

export const FILE_LIMITS = {
  videoMaxBytes: 500 * MIB,
  imageMaxBytes: 30 * MIB,
  chunkMaxBytes: 10 * MIB,
} as const;

export const PAGINATION = {
  defaultLimit: 25,
  maxLimit: 100,
} as const;

export const USER_STATUSES = ["active", "disabled"] as const;
export const WORKSPACE_STATUSES = ["active", "disabled", "deleting"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];
export const CONNECTION_STATUSES = ["active", "reconnect_required"] as const;
export const ASSET_KINDS = [
  "ad_account",
  "page",
  "instagram",
  "pixel",
] as const;
export const LANDING_STATUSES = [
  "unchecked",
  "ok",
  "soft_ok",
  "error",
] as const;
export const COPY_SOURCES = ["ai", "manual"] as const;
export const COPY_STATUSES = ["suggested", "saved", "discarded"] as const;

export const CREATIVE_KINDS = ["video", "image"] as const;
export const CREATIVE_SOURCES = ["browser", "drive"] as const;
export const CREATIVE_STATUSES = [
  "uploading",
  "importing",
  "processing",
  "ready",
  "failed",
  "archived",
] as const;
export const CREATIVE_AI_STATUSES = [
  "pending",
  "queued",
  "done",
  "failed",
  "skipped",
] as const;
export const UPLOAD_STATUSES = [
  "uploading",
  "completed",
  "aborted",
  "expired",
] as const;

export const LAUNCH_STATUSES = [
  "draft",
  "simulated",
  "queued",
  "running",
  "verifying",
  "paused_verified",
  "verified_with_errors",
  "activating",
  "active",
  "scheduled",
  "failed",
  "discarded",
] as const;
export const LAUNCH_SOURCES = ["manual", "chat", "pilot", "top_ads"] as const;
export const LAUNCH_MODES = ["new_cbo", "existing_cbo"] as const;
export const LAUNCH_ITEM_SOURCES = ["upload", "drive", "clone"] as const;
export const LAUNCH_ITEM_STATUSES = [
  "pending",
  "processing_media",
  "creating_creative",
  "creating_ad",
  "done",
  "failed",
] as const;

export const PILOT_RUN_TRIGGERS = ["cron", "manual"] as const;
export const PILOT_RUN_STATUSES = ["running", "done", "failed"] as const;
export const PROPOSAL_ACTIONS = ["pause", "scale", "duplicate"] as const;
export const PROPOSAL_STATUSES = [
  "pending",
  "executing",
  "executed",
  "dismissed",
  "failed",
  "expired",
] as const;

export const AUDIT_ACTOR_TYPES = ["user", "superadmin", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export const AUDIT_ORIGINS = ["manual", "pilot", "chat", "system"] as const;
export type AuditOrigin = (typeof AUDIT_ORIGINS)[number];
export const AUDIT_RESULTS = ["ok", "error"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];
export const CHAT_ROLES = ["user", "assistant", "tool"] as const;
