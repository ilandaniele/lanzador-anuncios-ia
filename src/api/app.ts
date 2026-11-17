import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError, notFound } from "./lib/errors";
import { csrf } from "./middleware/csrf";
import { errorHandler } from "./middleware/error-handler";
import { apiHeaders } from "./middleware/headers";
import { clientIp, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { authRoutes } from "./routes/auth";
import { memberRoutes } from "./routes/members";
import { testSupportRoutes } from "./routes/test-support";
import { workspaceRoutes } from "./routes/workspaces";
import type { AppEnv } from "./types";

const MAX_JSON_BODY_BYTES = 16 * 1024;

const jsonBodyLimit = bodyLimit({
  maxSize: MAX_JSON_BODY_BYTES,
  onError: () => {
    throw new AppError(413, "PAYLOAD_TOO_LARGE");
  },
});

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use(
    requestId,
    ...apiHeaders,
    rateLimit("RL_IP", clientIp),
    csrf,
    jsonBodyLimit,
  );
  app.onError(errorHandler);
  app.notFound((c) => errorHandler(notFound(), c));

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/", authRoutes);
  app.route("/", workspaceRoutes);
  app.route("/", memberRoutes);
  app.route("/", testSupportRoutes);

  return app;
}
