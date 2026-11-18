import { Hono } from "hono";
import { updatePilotRulesRequestSchema } from "../../shared/schemas/pilot";
import { parseJson } from "../lib/validate";
import { member } from "../middleware/member";
import { listPilotRules, updatePilotRules } from "../services/pilot-rules";
import type { AppEnv } from "../types";

export const pilotRuleRoutes = new Hono<AppEnv>()
  .get("/w/:wid/pilot/rules", ...member("viewer"), async (c) =>
    c.json(await listPilotRules(c.env.DB, c.get("scope")!)),
  )
  .put("/w/:wid/pilot/rules", ...member("admin"), async (c) => {
    const { rules } = await parseJson(c, updatePilotRulesRequestSchema);
    return c.json(
      await updatePilotRules(
        c.env.DB,
        c.get("scope")!,
        rules,
        c.get("requestId"),
      ),
    );
  });
