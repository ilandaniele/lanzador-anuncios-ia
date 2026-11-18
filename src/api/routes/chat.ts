import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/schemas/common";
import { parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
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
  );
