import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/schemas/common";
import { listPilotProposalsQuerySchema } from "../../shared/schemas/pilot";
import { parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { listPilotProposals, listPilotRuns } from "../services/pilot/list";
import { runPilot } from "../services/pilot/run";
import type { AppEnv } from "../types";

export const pilotRoutes = new Hono<AppEnv>()
  .post(
    "/w/:wid/pilot/run",
    ...member("editor"),
    expensiveRateLimit,
    async (c) => c.json(await runPilot(c.env, c.get("scope")!, "manual")),
  )
  .get("/w/:wid/pilot/runs", ...member("viewer"), async (c) =>
    c.json(
      await listPilotRuns(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, paginationQuerySchema),
      ),
    ),
  )
  .get("/w/:wid/pilot/proposals", ...member("viewer"), async (c) =>
    c.json(
      await listPilotProposals(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, listPilotProposalsQuerySchema),
      ),
    ),
  );
