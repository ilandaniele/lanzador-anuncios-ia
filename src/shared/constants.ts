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

export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

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
  contactSheetMaxBytes: MIB,
} as const;

export const PAGINATION = {
  defaultLimit: 25,
  maxLimit: 100,
} as const;

export const USER_STATUSES = ["active", "disabled"] as const;
export const WORKSPACE_STATUSES = ["active", "disabled", "deleting"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];
export const CONNECTION_STATUSES = ["active", "reconnect_required"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export const ASSET_KINDS = [
  "ad_account",
  "page",
  "instagram",
  "pixel",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const LANDING_STATUSES = [
  "unchecked",
  "ok",
  "soft_ok",
  "error",
] as const;
export type LandingStatus = (typeof LANDING_STATUSES)[number];
export const COPY_SOURCES = ["ai", "manual"] as const;
export const COPY_STATUSES = ["suggested", "saved", "discarded"] as const;
export const COPY_GENERATE_ANGLES = [
  "dolor",
  "beneficio",
  "prueba_social",
  "oferta",
  "urgencia",
  "libre",
] as const;
export type CopyGenerateAngle = (typeof COPY_GENERATE_ANGLES)[number];
export const COPY_ANGLES = [...COPY_GENERATE_ANGLES, "manual"] as const;
export type CopyAngle = (typeof COPY_ANGLES)[number];
export const COPY_POLICY_RISKS = ["none", "low", "high"] as const;
export type CopyPolicyRisk = (typeof COPY_POLICY_RISKS)[number];
export const COPY_VARIANTS_PER_GENERATION = 5;

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

export const PILOT_RULE_TYPES = [
  "pause_no_sales",
  "pause_low_roas",
  "scale_winner",
  "duplicate_winner",
] as const;
export const PILOT_RUN_TRIGGERS = ["cron", "manual"] as const;
export type PilotRunTrigger = (typeof PILOT_RUN_TRIGGERS)[number];
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
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const AUDIT_ACTOR_TYPES = ["user", "superadmin", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export const AUDIT_ORIGINS = ["manual", "pilot", "chat", "system"] as const;
export type AuditOrigin = (typeof AUDIT_ORIGINS)[number];
export const AUDIT_RESULTS = ["ok", "error"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];
export const CHAT_ROLES = ["user", "assistant", "tool"] as const;
export const CHAT_SESSION_STATUSES = [
  "open",
  "draft_created",
  "closed",
] as const;
export const MAX_CHAT_SESSION_MESSAGES = 60;

export const MAX_OWNED_WORKSPACES = 3;
export const MAX_SCALE_PERCENT = 50;
export const WORKSPACE_PURGE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export const AI_FEATURES = ["copy", "tagging", "pilot", "chat"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_USAGE_STATUSES = ["ok", "error", "blocked_budget"] as const;
export type AiUsageStatus = (typeof AI_USAGE_STATUSES)[number];
export const AI_BUDGET_SCOPES = [
  "workspace_day",
  "workspace_month",
  "global_day",
] as const;
export type AiBudgetScope = (typeof AI_BUDGET_SCOPES)[number];

export const ERROR_SOURCES = ["api", "workflow", "cron", "client"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];
