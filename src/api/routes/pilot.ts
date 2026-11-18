import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/schemas/common";
import {
  approvePilotProposalRequestSchema,
  dismissPilotProposalRequestSchema,
  listPilotProposalsQuerySchema,
} from "../../shared/schemas/pilot";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { approveProposal, dismissProposal } from "../services/pilot/decide";
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
  )
  .post(
    "/w/:wid/pilot/proposals/:id/approve",
    ...member("editor"),
    async (c) => {
      const input = await parseJson(c, approvePilotProposalRequestSchema);
      return c.json(
        await approveProposal(
          c.env,
          c.get("scope")!,
          c.req.param("id"),
          input,
          c.get("requestId"),
        ),
      );
    },
  )
  .post(
    "/w/:wid/pilot/proposals/:id/dismiss",
    ...member("editor"),
    async (c) => {
      const input = await parseJson(c, dismissPilotProposalRequestSchema);
      return c.json(
        await dismissProposal(
          c.env.DB,
          c.get("scope")!,
          c.req.param("id"),
          input,
          c.get("requestId"),
        ),
      );
    },
  );
