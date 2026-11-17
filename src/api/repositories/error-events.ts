import { drizzle } from "drizzle-orm/d1";
import { errorEvents } from "../../db/schema/ops";
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
