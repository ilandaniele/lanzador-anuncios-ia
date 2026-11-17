import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import {
  clearSessionCookie,
  resolveSession,
  SESSION_COOKIE,
} from "../services/auth/session";
import type { AppEnv } from "../types";
import { rateLimit } from "./rate-limit";

const userRateLimit = rateLimit("RL_USER", (c) => c.get("user")!.id);

export const session = ({ required }: { required: boolean }) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const resolved = token ? await resolveSession(c.env.DB, token) : null;
    if (!resolved) {
      if (token) c.header("Set-Cookie", clearSessionCookie(), { append: true });
      if (required) throw new AppError(401, "UNAUTHENTICATED");
      return next();
    }

    c.set("user", resolved.user);
    if (resolved.cookie) {
      c.header("Set-Cookie", resolved.cookie, { append: true });
    }
    return userRateLimit(c, next);
  });
