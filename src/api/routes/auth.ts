import { type Context, Hono } from "hono";
import {
  magicLinkRequestSchema,
  verifyRequestSchema,
} from "../../shared/schemas/auth";
import { parseJson } from "../lib/validate";
import { clientIp, rateLimit, requestIp } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import { requestMagicLink, verifyMagicLink } from "../services/auth/magic-link";
import { getMe } from "../services/auth/me";
import {
  clearSessionCookie,
  destroySession,
  destroyUserSessions,
} from "../services/auth/session";
import type { AppEnv } from "../types";

const authRateLimit = rateLimit("RL_AUTH", clientIp);

const loggedOut = (c: Context<AppEnv>) => {
  c.header("Set-Cookie", clearSessionCookie(), { append: true });
  return c.body(null, 204);
};

export const authRoutes = new Hono<AppEnv>()
  .post("/auth/magic-link", authRateLimit, async (c) => {
    const { email } = await parseJson(c, magicLinkRequestSchema);
    await requestMagicLink(c.env, email, requestIp(c));
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
