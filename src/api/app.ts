import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError, notFound } from "./lib/errors";
import { csrf } from "./middleware/csrf";
import { errorHandler } from "./middleware/error-handler";
import { apiHeaders } from "./middleware/headers";
import { clientIp, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { adminRoutes } from "./routes/admin";
import { auditRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { copyRoutes } from "./routes/copies";
import { invitationRoutes } from "./routes/invitations";
import { launchRoutes } from "./routes/launches";
import { memberRoutes } from "./routes/members";
import { metaActionRoutes } from "./routes/meta-actions";
import { metaCampaignRoutes } from "./routes/meta-campaigns";
import { metaConnectionRoutes } from "./routes/meta-connections";
import { metaOAuthRoutes } from "./routes/meta-oauth";
import { pilotRuleRoutes } from "./routes/pilot-rules";
import { productRoutes } from "./routes/products";
import { protectedCampaignRoutes } from "./routes/protected-campaigns";
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
  app.route("/", invitationRoutes);
  app.route("/", productRoutes);
  app.route("/", copyRoutes);
  app.route("/", launchRoutes);
  app.route("/", metaOAuthRoutes);
  app.route("/", metaConnectionRoutes);
  app.route("/", metaCampaignRoutes);
  app.route("/", metaActionRoutes);
  app.route("/", protectedCampaignRoutes);
  app.route("/", auditRoutes);
  app.route("/", chatRoutes);
  app.route("/", pilotRuleRoutes);
  app.route("/", adminRoutes);
  app.route("/", testSupportRoutes);

  return app;
}
