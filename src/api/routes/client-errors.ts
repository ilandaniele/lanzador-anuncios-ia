import { Hono } from "hono";
import { clientErrorRequestSchema } from "../../shared/schemas/client-errors";
import { parseJson } from "../lib/validate";
import { clientIp, rateLimit } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import { recordClientError } from "../services/client-errors";
import type { AppEnv } from "../types";

export const clientErrorRoutes = new Hono<AppEnv>().post(
  "/client-errors",
  rateLimit("RL_CLIENT_ERR", clientIp),
  session({ required: false }),
  async (c) => {
    const input = await parseJson(c, clientErrorRequestSchema);
    await recordClientError(c.env.DB, c.get("user"), c.get("requestId"), input);
    return c.body(null, 204);
  },
);
