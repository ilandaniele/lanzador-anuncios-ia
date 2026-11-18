import { Hono } from "hono";
import {
  createLaunchRequestSchema,
  launchDraftRequestSchema,
  launchProgressQuerySchema,
  launchRetryRequestSchema,
  launchStartRequestSchema,
  listLaunchesQuerySchema,
} from "../../shared/schemas/launch";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit, pollRateLimit } from "../middleware/rate-limit";
import {
  createLaunchDraft,
  discardLaunch,
  getLaunch,
  listLaunches,
  patchLaunchDraft,
} from "../services/launch/drafts";
import { getLaunchProgress } from "../services/launch/progress";
import { retryFailedItems } from "../services/launch/retry";
import { simulateLaunch } from "../services/launch/simulate";
import { startLaunch } from "../services/launch/start";
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
  .post("/w/:wid/launches", ...member("editor"), async (c) => {
    const { draft, source } = await parseJson(c, createLaunchRequestSchema);
    return c.json(
      await createLaunchDraft(c.env.DB, c.get("scope")!, draft, source),
      201,
    );
  })
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
  .post(
    "/w/:wid/launches/:id/simulate",
    ...member("editor"),
    expensiveRateLimit,
    async (c) =>
      c.json(await simulateLaunch(c.env, c.get("scope")!, c.req.param("id"))),
  )
  .post(
    "/w/:wid/launches/:id/start",
    ...member("editor"),
    expensiveRateLimit,
    async (c) =>
      c.json(
        await startLaunch(
          c.env,
          c.get("scope")!,
          c.req.param("id"),
          await parseJson(c, launchStartRequestSchema),
        ),
        202,
      ),
  )
  .get(
    "/w/:wid/launches/:id/progress",
    ...member("viewer"),
    pollRateLimit,
    async (c) =>
      c.json(
        await getLaunchProgress(
          c.env.DB,
          c.get("scope")!,
          c.req.param("id"),
          parseQuery(c, launchProgressQuerySchema),
        ),
      ),
  )
  .post(
    "/w/:wid/launches/:id/retry-failed",
    ...member("editor"),
    expensiveRateLimit,
    async (c) => {
      await parseJson(c, launchRetryRequestSchema);
      return c.json(
        await retryFailedItems(c.env, c.get("scope")!, c.req.param("id")),
        202,
      );
    },
  )
  .post("/w/:wid/launches/:id/discard", ...member("editor"), async (c) => {
    await discardLaunch(c.env.DB, c.get("scope")!, c.req.param("id"));
    return c.body(null, 204);
  });
