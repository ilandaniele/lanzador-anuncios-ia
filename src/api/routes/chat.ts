import { Hono } from "hono";
import { sendChatMessageRequestSchema } from "../../shared/schemas/chat";
import { paginationQuerySchema } from "../../shared/schemas/common";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { sendChatMessage } from "../services/chat/agent";
import {
  createChatSession,
  listChatMessages,
  listChatSessions,
} from "../services/chat/sessions";
import type { AppEnv } from "../types";

export const chatRoutes = new Hono<AppEnv>()
  .post("/w/:wid/chat/sessions", ...member("editor"), async (c) =>
    c.json(await createChatSession(c.env.DB, c.get("scope")!), 201),
  )
  .get("/w/:wid/chat/sessions", ...member("editor"), async (c) =>
    c.json(
      await listChatSessions(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, paginationQuerySchema),
      ),
    ),
  )
  .get("/w/:wid/chat/sessions/:id/messages", ...member("editor"), async (c) =>
    c.json(
      await listChatMessages(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        parseQuery(c, paginationQuerySchema),
      ),
    ),
  )
  .post(
    "/w/:wid/chat/sessions/:id/messages",
    ...member("editor"),
    expensiveRateLimit,
    async (c) => {
      const { text } = await parseJson(c, sendChatMessageRequestSchema);
      return c.json(
        await sendChatMessage(c.env, c.get("scope")!, c.req.param("id"), text),
      );
    },
  );
