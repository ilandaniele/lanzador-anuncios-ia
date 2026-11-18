import { Hono } from "hono";
import {
  archiveCreativeRequestSchema,
  creativePatchSchema,
  listCreativesQuerySchema,
} from "../../shared/schemas/creatives";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
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
  });
