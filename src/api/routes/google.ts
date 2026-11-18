import { Hono } from "hono";
import {
  driveImportRequestSchema,
  googleConnectRequestSchema,
} from "../../shared/schemas/google";
import { parseJson } from "../lib/validate";
import { member } from "../middleware/member";
import { authRateLimit, expensiveRateLimit } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import {
  disconnectGoogle,
  getGoogleConnection,
  pickerToken,
} from "../services/google/connection";
import { startDriveImport } from "../services/google/imports";
import {
  completeGoogleConnect,
  startGoogleConnect,
} from "../services/google/oauth";
import type { AppEnv } from "../types";

const LOGIN_PATH = "/login";

export const googleRoutes = new Hono<AppEnv>()
  .post("/w/:wid/google/connect", ...member("editor"), async (c) =>
    c.json(
      await startGoogleConnect(
        c.env,
        c.get("scope")!,
        await parseJson(c, googleConnectRequestSchema),
      ),
    ),
  )
  .get(
    "/google/oauth/callback",
    authRateLimit,
    session({ required: false }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.redirect(LOGIN_PATH, 302);
      const path = await completeGoogleConnect(
        c.env,
        user.id,
        c.req.query(),
        c.get("requestId"),
      );
      return c.redirect(path, 302);
    },
  )
  .get("/w/:wid/google/connection", ...member("editor"), async (c) =>
    c.json(await getGoogleConnection(c.env.DB, c.get("scope")!)),
  )
  .delete("/w/:wid/google/connection", ...member("viewer"), async (c) => {
    await disconnectGoogle(c.env, c.get("scope")!, c.get("requestId"));
    return c.body(null, 204);
  })
  .get("/w/:wid/google/picker-token", ...member("editor"), async (c) =>
    c.json(await pickerToken(c.env, c.get("scope")!)),
  )
  .post(
    "/w/:wid/google/imports",
    ...member("editor"),
    expensiveRateLimit,
    async (c) =>
      c.json(
        await startDriveImport(
          c.env,
          c.get("scope")!,
          await parseJson(c, driveImportRequestSchema),
        ),
        202,
      ),
  );
