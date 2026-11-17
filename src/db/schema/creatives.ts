import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { metaAssets } from "./meta";
import { workspaces } from "./workspaces";

export const creatives = sqliteTable(
  "creatives",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adAccountAssetId: text("ad_account_asset_id")
      .notNull()
      .references(() => metaAssets.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    metaVideoId: text("meta_video_id"),
    metaImageHash: text("meta_image_hash"),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailRefreshedAt: integer("thumbnail_refreshed_at"),
    formatWarning: text("format_warning"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    source: text("source").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    aiStatus: text("ai_status").notNull().default("pending"),
    tagHook: text("tag_hook"),
    tagAngle: text("tag_angle"),
    tagFormat: text("tag_format"),
    tagLanguage: text("tag_language"),
    tagOnScreenText: integer("tag_on_screen_text"),
    tagSummary: text("tag_summary"),
    tagsEdited: integer("tags_edited").notNull().default(0),
    aiModel: text("ai_model"),
    adNameSuggested: text("ad_name_suggested"),
    adName: text("ad_name"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("creatives_kind_check", sql`${t.kind} IN ('video','image')`),
    check(
      "creatives_content_type_check",
      sql`${t.contentType} IN ('video/mp4','video/quicktime','video/x-m4v','image/jpeg','image/png')`,
    ),
    check("creatives_size_bytes_check", sql`${t.sizeBytes} > 0`),
    check(
      "creatives_format_warning_check",
      sql`${t.formatWarning} IN ('horizontal')`,
    ),
    check("creatives_source_check", sql`${t.source} IN ('browser','drive')`),
    check(
      "creatives_status_check",
      sql`${t.status} IN ('uploading','importing','processing','ready','failed','archived')`,
    ),
    check(
      "creatives_ai_status_check",
      sql`${t.aiStatus} IN ('pending','queued','done','failed','skipped')`,
    ),
    check(
      "creatives_tag_format_check",
      sql`${t.tagFormat} IN ('ugc','demo','testimonio','estatico','otro')`,
    ),
    check(
      "creatives_tag_on_screen_text_check",
      sql`${t.tagOnScreenText} IN (0,1)`,
    ),
    check("creatives_tags_edited_check", sql`${t.tagsEdited} IN (0,1)`),
    index("creatives_ws_status_created_idx").on(
      t.workspaceId,
      t.status,
      t.createdAt,
    ),
    index("creatives_ws_sha_idx").on(t.workspaceId, t.sha256),
    index("creatives_status_thumbnail_idx").on(
      t.status,
      t.thumbnailRefreshedAt,
    ),
    index("creatives_ai_status_idx").on(t.aiStatus, t.createdAt),
  ],
);

export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    creativeId: text("creative_id")
      .unique()
      .references(() => creatives.id, { onDelete: "set null" }),
    adAccountAssetId: text("ad_account_asset_id")
      .notNull()
      .references(() => metaAssets.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    metaUploadSessionId: text("meta_upload_session_id"),
    startOffset: integer("start_offset").notNull().default(0),
    endOffset: integer("end_offset").notNull().default(0),
    status: text("status").notNull().default("uploading"),
    expiresAt: integer("expires_at").notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check("uploads_kind_check", sql`${t.kind} IN ('video','image')`),
    check("uploads_size_bytes_check", sql`${t.sizeBytes} > 0`),
    check("uploads_start_offset_check", sql`${t.startOffset} >= 0`),
    check("uploads_end_offset_check", sql`${t.endOffset} >= 0`),
    check(
      "uploads_status_check",
      sql`${t.status} IN ('uploading','completed','aborted','expired')`,
    ),
    index("uploads_status_expires_idx").on(t.status, t.expiresAt),
  ],
);
