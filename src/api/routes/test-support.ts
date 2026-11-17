import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { magicLinkRequestSchema } from "../../shared/schemas/auth";
import { magicLinkUrl } from "../emails/magic-link";
import { notFound } from "../lib/errors";
import { timingSafeEqual } from "../lib/hash";
import { parseJson } from "../lib/validate";
import { clientIp, rateLimit, requestIp } from "../middleware/rate-limit";
import { issueMagicLink } from "../services/auth/magic-link";
import type { AppEnv } from "../types";

const e2eOnly = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.E2E_SECRET;
  const given = c.req.header("X-E2E-Secret");
  const allowed =
    c.env.ENVIRONMENT !== "production" &&
    Boolean(expected) &&
    Boolean(given) &&
    timingSafeEqual(given!, expected!);
  if (!allowed) throw notFound();
  await next();
});

export const testSupportRoutes = new Hono<AppEnv>().post(
  "/test/magic-link",
  e2eOnly,
  rateLimit("RL_AUTH", clientIp),
  async (c) => {
    const { email } = await parseJson(c, magicLinkRequestSchema);
    const link = await issueMagicLink(c.env, email, requestIp(c));
    return c.json({
      link: link ? magicLinkUrl(c.env.APP_ORIGIN, link.token) : null,
    });
  },
);
