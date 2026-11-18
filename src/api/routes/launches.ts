import { Hono } from "hono";
import {
  launchDraftRequestSchema,
  listLaunchesQuerySchema,
} from "../../shared/schemas/launch";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import {
  createLaunchDraft,
  discardLaunch,
  getLaunch,
  listLaunches,
  patchLaunchDraft,
} from "../services/launch/drafts";
import type { AppEnv } from "../types";

export const launchRoutes = new Hono<AppEnv>()
  .get("/w/:wid/launches", ...member("viewer"), async (c) =>
    c.json(
      await listLaunches(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, listLaunchesQuerySchema),
      ),
    ),
  )
  .post("/w/:wid/launches", ...member("editor"), async (c) =>
    c.json(
      await createLaunchDraft(
        c.env.DB,
        c.get("scope")!,
        (await parseJson(c, launchDraftRequestSchema)).draft,
      ),
      201,
    ),
  )
  .get("/w/:wid/launches/:id", ...member("viewer"), async (c) =>
    c.json(await getLaunch(c.env.DB, c.get("scope")!, c.req.param("id"))),
  )
  .patch("/w/:wid/launches/:id", ...member("editor"), async (c) =>
    c.json(
      await patchLaunchDraft(
        c.env.DB,
        c.get("scope")!,
        c.req.param("id"),
        (await parseJson(c, launchDraftRequestSchema)).draft,
      ),
    ),
  )
  .post("/w/:wid/launches/:id/discard", ...member("editor"), async (c) => {
    await discardLaunch(c.env.DB, c.get("scope")!, c.req.param("id"));
    return c.body(null, 204);
  });
