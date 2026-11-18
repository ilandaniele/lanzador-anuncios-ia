import type { ClientErrorRequest } from "../../shared/schemas/client-errors";
import { sha256Hex } from "../lib/hash";
import { scrub } from "../lib/logger";
import { insertErrorEvent } from "../repositories/error-events";
import type { SessionUser } from "../types";

const withoutQuery = (route: string) => route.split(/[?#]/)[0]!;

export async function recordClientError(
  db: D1Database,
  user: SessionUser | undefined,
  requestId: string,
  { message, stack, route }: ClientErrorRequest,
): Promise<void> {
  await insertErrorEvent(db, {
    source: "client",
    requestId,
    route: withoutQuery(route),
    message: scrub(message),
    stackHash: stack ? await sha256Hex(stack) : null,
    userId: user?.id ?? null,
  });
}
