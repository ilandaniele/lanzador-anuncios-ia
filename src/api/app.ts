import { Hono } from "hono";
import { notFound } from "./lib/errors";
import { csrf } from "./middleware/csrf";
import { errorHandler } from "./middleware/error-handler";
import { apiHeaders } from "./middleware/headers";
import { clientIp, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { authRoutes } from "./routes/auth";
import { testSupportRoutes } from "./routes/test-support";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use(requestId, ...apiHeaders, rateLimit("RL_IP", clientIp), csrf);
  app.onError(errorHandler);
  app.notFound((c) => errorHandler(notFound(), c));

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/", authRoutes);
  app.route("/", testSupportRoutes);

  return app;
}
