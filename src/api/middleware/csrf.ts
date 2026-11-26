import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

const SIGNED_CALLBACK_PATHS = new Set([
  "/api/meta/deauthorize",
  "/api/meta/data-deletion",
  "/api/billing/mercadopago/webhook",
]);

export const csrf = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "OPTIONS") throw new AppError(403, "CSRF_FAILED");

  const needsCheck =
    !SAFE_METHODS.has(method) && !SIGNED_CALLBACK_PATHS.has(c.req.path);
  if (needsCheck) {
    const origin = c.req.header("Origin");
    const trusted =
      Boolean(origin) &&
      origin === c.env.APP_ORIGIN &&
      c.req.header("X-Lanzador") === "1";
    if (!trusted) throw new AppError(403, "CSRF_FAILED");
  }

  await next();
});
