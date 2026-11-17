import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { launches } from "./launches";
import { workspaces } from "./workspaces";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").notNull(),
    origin: text("origin").notNull(),
    action: text("action").notNull(),
    objectType: text("object_type"),
    objectMetaId: text("object_meta_id"),
    objectName: text("object_name"),
    adAccountMetaId: text("ad_account_meta_id"),
    launchId: text("launch_id").references(() => launches.id, {
      onDelete: "set null",
    }),
    result: text("result").notNull(),
    detail: text("detail"),
    requestId: text("request_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "audit_log_actor_type_check",
      sql`${t.actorType} IN ('user','superadmin','system')`,
    ),
    check(
      "audit_log_origin_check",
      sql`${t.origin} IN ('manual','pilot','chat','system')`,
    ),
    check("audit_log_result_check", sql`${t.result} IN ('ok','error')`),
    check("audit_log_detail_check", sql`json_valid(${t.detail})`),
    index("audit_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("audit_ws_origin_created_idx").on(
      t.workspaceId,
      t.origin,
      t.createdAt,
    ),
    index("audit_log_actor_idx").on(t.workspaceId, t.actorUserId, t.createdAt),
    index("audit_ws_object_created_idx").on(
      t.workspaceId,
      t.objectMetaId,
      t.createdAt,
    ),
  ],
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    neurons: integer("neurons").notNull().default(0),
    status: text("status").notNull(),
    refId: text("ref_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "ai_usage_feature_check",
      sql`${t.feature} IN ('copy','tagging','pilot','chat')`,
    ),
    check("ai_usage_provider_check", sql`${t.provider} IN ('workers_ai')`),
    check(
      "ai_usage_status_check",
      sql`${t.status} IN ('ok','error','blocked_budget')`,
    ),
    index("ai_usage_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const usageCounters = sqliteTable(
  "usage_counters",
  {
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "usage_counters_scope_check",
      sql`${t.scope} IN ('workspace','global')`,
    ),
    check(
      "usage_counters_metric_check",
      sql`${t.metric} IN ('ai_neurons','meta_calls','launches','ads_created')`,
    ),
    primaryKey({ columns: [t.scope, t.scopeId, t.period, t.metric] }),
  ],
);

export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    status: text("status").notNull().default("open"),
    launchId: text("launch_id").references(() => launches.id, {
      onDelete: "set null",
    }),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "chat_sessions_status_check",
      sql`${t.status} IN ('open','draft_created','closed')`,
    ),
    check(
      "chat_sessions_message_count_check",
      sql`${t.messageCount} BETWEEN 0 AND 60`,
    ),
    index("chat_sessions_ws_user_updated_idx").on(
      t.workspaceId,
      t.userId,
      t.updatedAt,
    ),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    toolPayload: text("tool_payload"),
    aiUsageId: text("ai_usage_id").references(() => aiUsage.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "chat_messages_role_check",
      sql`${t.role} IN ('user','assistant','tool')`,
    ),
    check("chat_messages_content_check", sql`length(${t.content}) <= 8000`),
    check(
      "chat_messages_tool_payload_check",
      sql`json_valid(${t.toolPayload})`,
    ),
    index("chat_messages_session_created_idx").on(t.sessionId, t.createdAt),
  ],
);

export const errorEvents = sqliteTable(
  "error_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    requestId: text("request_id"),
    route: text("route"),
    status: integer("status"),
    code: text("code"),
    message: text("message").notNull(),
    stackHash: text("stack_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "error_events_source_check",
      sql`${t.source} IN ('api','workflow','cron','client')`,
    ),
    check("error_events_message_check", sql`length(${t.message}) <= 500`),
    index("error_events_created_idx").on(t.createdAt),
    index("error_events_source_created_idx").on(t.source, t.createdAt),
  ],
);

export const dataDeletionRequests = sqliteTable(
  "data_deletion_requests",
  {
    id: text("id").primaryKey(),
    confirmationCode: text("confirmation_code").notNull().unique(),
    metaUserId: text("meta_user_id").notNull(),
    status: text("status").notNull().default("received"),
    connectionsAffected: integer("connections_affected").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (t) => [
    check(
      "data_deletion_requests_status_check",
      sql`${t.status} IN ('received','done')`,
    ),
  ],
);
