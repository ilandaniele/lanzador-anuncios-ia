import { Hono } from "hono";
import { authRateLimit } from "../middleware/rate-limit";
import {
  dataDeletionStatus,
  deauthorizeMetaUser,
  requestDataDeletion,
} from "../services/meta/callbacks";
import type { AppEnv } from "../types";

export const metaCallbackRoutes = new Hono<AppEnv>()
  .post("/meta/deauthorize", async (c) => {
    const { signed_request } = await c.req.parseBody();
    return c.json(
      await deauthorizeMetaUser(c.env, signed_request, c.get("requestId")),
    );
  })
  .post("/meta/data-deletion", async (c) => {
    const { signed_request } = await c.req.parseBody();
    return c.json(await requestDataDeletion(c.env, signed_request));
  })
  .get("/meta/data-deletion/:code", authRateLimit, async (c) =>
    c.json(await dataDeletionStatus(c.env.DB, c.req.param("code"))),
  );
