import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  magicLinkRequestSchema,
  reviewerLinkRequestSchema,
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
import {
  clearGoogleStateCookie,
  completeGoogleLogin,
  GOOGLE_STATE_COOKIE,
  startGoogleLogin,
} from "../services/auth/google-login";
import { getMe } from "../services/auth/me";
import { issueReviewerLink } from "../services/auth/reviewer";
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
  .post("/auth/reviewer", authRateLimit, async (c) => {
    const { code } = await parseJson(c, reviewerLinkRequestSchema);
    const link = await issueReviewerLink(c.env, code, {
      ip: requestIp(c),
      requestId: c.get("requestId"),
    });
    return c.json({ link });
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
  .get("/auth/google/start", authRateLimit, async (c) => {
    const { redirectUrl, stateCookie } = await startGoogleLogin(c.env);
    if (stateCookie) c.header("Set-Cookie", stateCookie, { append: true });
    return c.redirect(redirectUrl, 302);
  })
  .get("/auth/google/callback", async (c) => {
    const { path, sessionCookie } = await completeGoogleLogin(c.env, {
      rawQuery: c.req.query(),
      stateCookie: getCookie(c, GOOGLE_STATE_COOKIE),
      meta: { userAgent: c.req.header("User-Agent"), ip: requestIp(c) },
      requestId: c.get("requestId"),
    });
    c.header("Set-Cookie", clearGoogleStateCookie(), { append: true });
    if (sessionCookie) c.header("Set-Cookie", sessionCookie, { append: true });
    return c.redirect(path, 302);
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
