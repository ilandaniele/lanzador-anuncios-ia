import { Hono } from "hono";
import { FILE_LIMITS } from "../../shared/constants";
import {
  archiveCreativeRequestSchema,
  creativePatchSchema,
  listCreativesQuerySchema,
} from "../../shared/schemas/creatives";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { payloadLimit } from "../middleware/payload-limit";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { retagCreative, tagFromContactSheet } from "../services/ai/tagging";
import {
  archiveCreative,
  getCreative,
  listCreatives,
  patchCreative,
} from "../services/creatives";
import type { AppEnv } from "../types";

export const creativeRoutes = new Hono<AppEnv>()
  .get("/w/:wid/creatives", ...member("viewer"), async (c) =>
    c.json(
      await listCreatives(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, listCreativesQuerySchema),
      ),
    ),
  )
  .get("/w/:wid/creatives/:id", ...member("viewer"), async (c) =>
    c.json(await getCreative(c.env.DB, c.get("scope")!, c.req.param("id"))),
  )
  .patch("/w/:wid/creatives/:id", ...member("editor"), async (c) =>
    c.json(
      await patchCreative(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        await parseJson(c, creativePatchSchema),
      ),
    ),
  )
  .post("/w/:wid/creatives/:id/archive", ...member("editor"), async (c) => {
    const { archived } = await parseJson(c, archiveCreativeRequestSchema);
    return c.json(
      await archiveCreative(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        archived,
      ),
    );
  })
  .post(
    "/w/:wid/creatives/:id/tag",
    ...member("editor"),
    expensiveRateLimit,
    payloadLimit(FILE_LIMITS.contactSheetMaxBytes),
    async (c) =>
      c.json(
        await tagFromContactSheet(c.env, c.get("scope")!, c.req.param("id"), {
          contentType: c.req.header("Content-Type"),
          body: await c.req.arrayBuffer(),
        }),
      ),
  )
  .post(
    "/w/:wid/creatives/:id/retag",
    ...member("editor"),
    expensiveRateLimit,
    async (c) =>
      c.json(
        await retagCreative(c.env, c.get("scope")!, c.req.param("id")),
        202,
      ),
  );
