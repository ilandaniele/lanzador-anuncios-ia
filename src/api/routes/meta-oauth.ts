import { Hono } from "hono";
import { member } from "../middleware/member";
import { authRateLimit } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import { completeMetaConnect, startMetaConnect } from "../services/meta/oauth";
import type { AppEnv } from "../types";

const LOGIN_PATH = "/login";

export const metaOAuthRoutes = new Hono<AppEnv>()
  .post("/w/:wid/meta/connect", ...member("admin"), async (c) =>
    c.json(await startMetaConnect(c.env, c.get("scope")!)),
  )
  .get(
    "/meta/oauth/callback",
    authRateLimit,
    session({ required: false }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.redirect(LOGIN_PATH, 302);
      const path = await completeMetaConnect(
        c.env,
        user.id,
        c.req.query(),
        c.get("requestId"),
      );
      return c.redirect(path, 302);
    },
  );
