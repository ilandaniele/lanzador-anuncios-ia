import { Hono } from "hono";
import { notFound } from "./lib/errors";
import { csrf } from "./middleware/csrf";
import { errorHandler } from "./middleware/error-handler";
import { apiHeaders } from "./middleware/headers";
import { clientIp, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use(requestId, ...apiHeaders, rateLimit("RL_IP", clientIp), csrf);
  app.onError(errorHandler);
  app.notFound((c) => errorHandler(notFound(), c));

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
