import { and, asc, desc, eq, gt, lt, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { chatMessages, chatSessions } from "../../db/schema/ops";
import {
  type CHAT_ROLES,
  type CHAT_SESSION_STATUSES,
  MAX_CHAT_SESSION_MESSAGES,
} from "../../shared/constants";
import { isCheckViolation } from "./db-errors";
import { inWorkspace, type Scope } from "./scope";

const sessionColumns = {
  id: chatSessions.id,
  title: chatSessions.title,
  status: sql<(typeof CHAT_SESSION_STATUSES)[number]>`${chatSessions.status}`,
  launchId: chatSessions.launchId,
  messageCount: chatSessions.messageCount,
  updatedAt: chatSessions.updatedAt,
};

const messageColumns = {
  id: chatMessages.id,
  role: sql<Exclude<(typeof CHAT_ROLES)[number], "tool">>`${chatMessages.role}`,
  content: chatMessages.content,
  createdAt: chatMessages.createdAt,
};

export type ChatCursor = { id: string; sortValue: number };

export type NewChatMessage = Pick<
  typeof chatMessages.$inferInsert,
  "role" | "content" | "toolName" | "toolPayload" | "aiUsageId"
> & { id: string };

const ownSession = (scope: Scope) =>
  and(inWorkspace(chatSessions, scope), eq(chatSessions.userId, scope.userId));

const updatedBefore = ({ id, sortValue }: ChatCursor) =>
  or(
    lt(chatSessions.updatedAt, sortValue),
    and(eq(chatSessions.updatedAt, sortValue), lt(chatSessions.id, id)),
  );

const createdAfter = ({ id, sortValue }: ChatCursor) =>
  or(
    gt(chatMessages.createdAt, sortValue),
    and(eq(chatMessages.createdAt, sortValue), gt(chatMessages.id, id)),
  );

export const selectChatSessions = (
  db: D1Database,
  scope: Scope,
  { after, size }: { after?: ChatCursor; size: number },
) =>
  drizzle(db)
    .select(sessionColumns)
    .from(chatSessions)
    .where(and(ownSession(scope), after ? updatedBefore(after) : undefined))
    .orderBy(desc(chatSessions.updatedAt), desc(chatSessions.id))
    .limit(size + 1);

export type ChatSessionRow = Awaited<
  ReturnType<typeof selectChatSessions>
>[number];

export async function findChatSession(
  db: D1Database,
  scope: Scope,
  id: string,
): Promise<ChatSessionRow | null> {
  const [row] = await drizzle(db)
    .select(sessionColumns)
    .from(chatSessions)
    .where(and(ownSession(scope), eq(chatSessions.id, id)))
    .limit(1);
  return row ?? null;
}

export async function insertChatSession(
  db: D1Database,
  scope: Scope,
  row: { id: string; at: number },
): Promise<ChatSessionRow> {
  const [inserted] = await drizzle(db)
    .insert(chatSessions)
    .values({
      id: row.id,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      createdAt: row.at,
      updatedAt: row.at,
    })
    .returning(sessionColumns);
  return inserted!;
}

export const selectVisibleChatMessages = (
  db: D1Database,
  scope: Scope,
  sessionId: string,
  { after, size }: { after?: ChatCursor; size: number },
) =>
  drizzle(db)
    .select(messageColumns)
    .from(chatMessages)
    .where(
      and(
        inWorkspace(chatMessages, scope),
        eq(chatMessages.sessionId, sessionId),
        ne(chatMessages.role, "tool"),
        after ? createdAfter(after) : undefined,
      ),
    )
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .limit(size + 1);

export type ChatMessageRow = Awaited<
  ReturnType<typeof selectVisibleChatMessages>
>[number];

export async function selectRecentChatHistory(
  db: D1Database,
  scope: Scope,
  sessionId: string,
  size: number,
) {
  const rows = await drizzle(db)
    .select({ role: messageColumns.role, content: messageColumns.content })
    .from(chatMessages)
    .where(
      and(
        inWorkspace(chatMessages, scope),
        eq(chatMessages.sessionId, sessionId),
        ne(chatMessages.role, "tool"),
      ),
    )
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(size);
  return rows.reverse();
}

export async function appendChatMessages(
  db: D1Database,
  scope: Scope,
  sessionId: string,
  messages: NewChatMessage[],
  at: number,
  launchId?: string,
): Promise<boolean> {
  const orm = drizzle(db);
  const added = messages.length;
  const openStatus = launchId ? sql`'draft_created'` : chatSessions.status;
  try {
    await orm.batch([
      orm.insert(chatMessages).values(
        messages.map((message) => ({
          ...message,
          workspaceId: scope.workspaceId,
          sessionId,
          createdAt: at,
        })),
      ),
      orm
        .update(chatSessions)
        .set({
          messageCount: sql`${chatSessions.messageCount} + ${added}`,
          status: sql`CASE WHEN ${chatSessions.messageCount} + ${added} >= ${MAX_CHAT_SESSION_MESSAGES} THEN 'closed' ELSE ${openStatus} END`,
          ...(launchId ? { launchId } : {}),
          updatedAt: at,
        })
        .where(and(ownSession(scope), eq(chatSessions.id, sessionId))),
    ]);
    return true;
  } catch (error) {
    if (isCheckViolation(error, "chat_sessions_message_count_check")) {
      return false;
    }
    throw error;
  }
}
