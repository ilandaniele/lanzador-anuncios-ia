import { Hono } from "hono";
import { listAuditQuerySchema } from "../../shared/schemas/audit";
import { parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { listAudit } from "../services/audit";
import type { AppEnv } from "../types";

export const auditRoutes = new Hono<AppEnv>().get(
  "/w/:wid/audit",
  ...member("viewer"),
  async (c) =>
    c.json(
      await listAudit(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, listAuditQuerySchema),
      ),
    ),
);
