import type { PaginationQuery } from "../../../shared/schemas/common";
import type {
  ChatMessageDto,
  ChatSessionDto,
} from "../../../shared/schemas/chat";
import { MAX_CHAT_SESSION_MESSAGES } from "../../../shared/constants";
import { decodeNumericCursor, paginate } from "../../lib/cursor";
import { conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import {
  appendChatMessages,
  type ChatMessageRow,
  type ChatSessionRow,
  findChatSession,
  insertChatSession,
  type NewChatMessage,
  selectChatSessions,
  selectVisibleChatMessages,
} from "../../repositories/chat";
import type { Scope } from "../../repositories/scope";

const toIso = (at: number) => new Date(at).toISOString();

const toSessionDto = (row: ChatSessionRow): ChatSessionDto => ({
  id: row.id,
  title: row.title,
  status: row.status,
  launchId: row.launchId,
  updatedAt: toIso(row.updatedAt),
});

const toMessageDto = (row: ChatMessageRow): ChatMessageDto => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: toIso(row.createdAt),
});

export async function createChatSession(db: D1Database, scope: Scope) {
  const session = await insertChatSession(db, scope, {
    id: newId(),
    at: now(),
  });
  return { session: toSessionDto(session) };
}

export async function listChatSessions(
  db: D1Database,
  scope: Scope,
  { cursor, limit }: PaginationQuery,
) {
  const page = paginate(
    await selectChatSessions(db, scope, {
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.updatedAt,
  );
  return { data: page.rows.map(toSessionDto), nextCursor: page.nextCursor };
}

export async function listChatMessages(
  db: D1Database,
  scope: Scope,
  sessionId: string,
  { cursor, limit }: PaginationQuery,
) {
  if ((await findChatSession(db, scope, sessionId)) === null) {
    throw notFound();
  }
  const page = paginate(
    await selectVisibleChatMessages(db, scope, sessionId, {
      after: cursor ? decodeNumericCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.createdAt,
  );
  return { data: page.rows.map(toMessageDto), nextCursor: page.nextCursor };
}

export async function appendSessionMessages(
  db: D1Database,
  scope: Scope,
  sessionId: string,
  messages: Omit<NewChatMessage, "id">[],
) {
  const session = await findChatSession(db, scope, sessionId);
  if (session === null) throw notFound();
  const fits =
    session.status !== "closed" &&
    session.messageCount + messages.length <= MAX_CHAT_SESSION_MESSAGES;
  const saved =
    fits &&
    (await appendChatMessages(
      db,
      scope,
      sessionId,
      messages.map((message) => ({ ...message, id: newId() })),
      now(),
    ));
  if (!saved) throw conflict("SESSION_CLOSED");
}
