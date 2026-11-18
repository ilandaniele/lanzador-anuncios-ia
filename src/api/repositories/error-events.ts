import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { errorEvents } from "../../db/schema/ops";
import type { ErrorSource } from "../../shared/constants";
import { newId } from "../lib/ids";
import { now } from "../lib/time";

const MESSAGE_MAX = 500;

export type NewErrorEvent = Omit<
  typeof errorEvents.$inferInsert,
  "id" | "createdAt"
>;

export async function insertErrorEvent(
  db: D1Database,
  event: NewErrorEvent,
): Promise<void> {
  await drizzle(db)
    .insert(errorEvents)
    .values({
      ...event,
      id: newId(),
      message: event.message.slice(0, MESSAGE_MAX),
      createdAt: now(),
    });
}

export type ErrorEventsQuery = {
  source?: ErrorSource;
  after?: { id: string; sortValue: number };
  size: number;
};

const olderThan = ({ id, sortValue }: { id: string; sortValue: number }) =>
  or(
    lt(errorEvents.createdAt, sortValue),
    and(eq(errorEvents.createdAt, sortValue), lt(errorEvents.id, id)),
  );

export const selectErrorEvents = (
  db: D1Database,
  { source, after, size }: ErrorEventsQuery,
) =>
  drizzle(db)
    .select({
      id: errorEvents.id,
      source: sql<ErrorSource>`${errorEvents.source}`,
      route: errorEvents.route,
      status: errorEvents.status,
      code: errorEvents.code,
      message: errorEvents.message,
      workspaceId: errorEvents.workspaceId,
      requestId: errorEvents.requestId,
      createdAt: errorEvents.createdAt,
    })
    .from(errorEvents)
    .where(
      and(
        source ? eq(errorEvents.source, source) : undefined,
        after ? olderThan(after) : undefined,
      ),
    )
    .orderBy(desc(errorEvents.createdAt), desc(errorEvents.id))
    .limit(size + 1);

export type ErrorEventRow = Awaited<
  ReturnType<typeof selectErrorEvents>
>[number];
