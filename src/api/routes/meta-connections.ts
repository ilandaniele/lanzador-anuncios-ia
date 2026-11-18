import { Hono } from "hono";
import {
  disconnectRequestSchema,
  listAssetsQuerySchema,
  patchAssetsRequestSchema,
} from "../../shared/schemas/meta-connections";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { listAssets, patchAssets } from "../services/meta/assets";
import {
  disconnectMeta,
  listConnections,
  refreshConnectionAssets,
} from "../services/meta/connections";
import type { AppEnv } from "../types";

export const metaConnectionRoutes = new Hono<AppEnv>()
  .get("/w/:wid/meta/connections", ...member("viewer"), async (c) =>
    c.json(await listConnections(c.env.DB, c.get("scope")!)),
  )
  .get("/w/:wid/meta/assets", ...member("viewer"), async (c) =>
    c.json(
      await listAssets(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, listAssetsQuerySchema),
      ),
    ),
  )
  .patch("/w/:wid/meta/assets", ...member("admin"), async (c) =>
    c.json(
      await patchAssets(
        c.env.DB,
        c.get("scope")!,
        c.get("requestId"),
        await parseJson(c, patchAssetsRequestSchema),
      ),
    ),
  )
  .post(
    "/w/:wid/meta/connections/:id/refresh-assets",
    ...member("admin"),
    expensiveRateLimit,
    async (c) =>
      c.json(
        await refreshConnectionAssets(
          c.env,
          c.get("scope")!,
          c.req.param("id"),
          c.get("requestId"),
        ),
      ),
  )
  .delete("/w/:wid/meta/connections/:id", ...member("admin"), async (c) => {
    await parseJson(c, disconnectRequestSchema);
    await disconnectMeta(
      c.env,
      c.get("scope")!,
      c.req.param("id"),
      c.get("requestId"),
    );
    return c.body(null, 204);
  });
