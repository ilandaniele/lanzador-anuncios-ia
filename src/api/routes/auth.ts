import { type Context, Hono } from "hono";
import {
  magicLinkRequestSchema,
  verifyRequestSchema,
} from "../../shared/schemas/auth";
import { parseJson } from "../lib/validate";
import { authRateLimit, requestIp } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import {
  deliverMagicLink,
  issueMagicLink,
  verifyMagicLink,
} from "../services/auth/magic-link";
import { getMe } from "../services/auth/me";
import {
  clearSessionCookie,
  destroySession,
  destroyUserSessions,
} from "../services/auth/session";
import type { AppEnv } from "../types";

const loggedOut = (c: Context<AppEnv>) => {
  c.header("Set-Cookie", clearSessionCookie(), { append: true });
  return c.body(null, 204);
};

export const authRoutes = new Hono<AppEnv>()
  .post("/auth/magic-link", authRateLimit, async (c) => {
    const { email } = await parseJson(c, magicLinkRequestSchema);
    const link = await issueMagicLink(c.env, email, requestIp(c));
    if (link) {
      c.executionCtx.waitUntil(
        deliverMagicLink(c.env, email, link, c.get("requestId")),
      );
    }
    return c.json({ ok: true }, 202);
  })
  .post("/auth/verify", authRateLimit, async (c) => {
    const { token } = await parseJson(c, verifyRequestSchema);
    const { me, cookie } = await verifyMagicLink(c.env, token, {
      userAgent: c.req.header("User-Agent"),
      ip: requestIp(c),
    });
    c.header("Set-Cookie", cookie, { append: true });
    return c.json(me);
  })
  .post("/auth/logout", session({ required: true }), async (c) => {
    await destroySession(c.env.DB, c.get("user")!.sessionId);
    return loggedOut(c);
  })
  .post("/auth/logout-all", session({ required: true }), async (c) => {
    await destroyUserSessions(c.env.DB, c.get("user")!.id);
    return loggedOut(c);
  })
  .get("/me", session({ required: true }), async (c) =>
    c.json(await getMe(c.env.DB, c.get("user")!)),
  );
