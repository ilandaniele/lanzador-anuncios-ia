import { Hono } from "hono";
import {
  adminErrorsQuerySchema,
  adminUsageQuerySchema,
  adminWorkspacesQuerySchema,
  createBetaInviteRequestSchema,
  patchAdminWorkspaceSchema,
} from "../../shared/schemas/admin";
import { paginationQuerySchema } from "../../shared/schemas/common";
import { parseJson, parseQuery } from "../lib/validate";
import { requireSuperadmin } from "../middleware/require-role";
import { session } from "../middleware/session";
import { listAdminErrors } from "../services/admin-errors";
import { getAdminUsage } from "../services/admin-usage";
import {
  listAdminWorkspaces,
  patchAdminWorkspace,
} from "../services/admin-workspaces";
import {
  createBetaInvite,
  listBetaInvites,
  revokeInvite,
} from "../services/beta-invites";
import type { AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>()
  .use("/admin/*", session({ required: true }), requireSuperadmin())
  .get("/admin/workspaces", async (c) =>
    c.json(
      await listAdminWorkspaces(
        c.env.DB,
        parseQuery(c, adminWorkspacesQuerySchema),
      ),
    ),
  )
  .patch("/admin/workspaces/:id", async (c) => {
    const patch = await parseJson(c, patchAdminWorkspaceSchema);
    return c.json(
      await patchAdminWorkspace(
        c.env.DB,
        c.get("user")!,
        c.req.param("id"),
        patch,
        c.get("requestId"),
      ),
    );
  })
  .get("/admin/usage", async (c) =>
    c.json(await getAdminUsage(c.env.DB, parseQuery(c, adminUsageQuerySchema))),
  )
  .get("/admin/errors", async (c) =>
    c.json(
      await listAdminErrors(c.env.DB, parseQuery(c, adminErrorsQuerySchema)),
    ),
  )
  .get("/admin/beta-invites", async (c) =>
    c.json(
      await listBetaInvites(c.env.DB, parseQuery(c, paginationQuerySchema)),
    ),
  )
  .post("/admin/beta-invites", async (c) => {
    const input = await parseJson(c, createBetaInviteRequestSchema);
    return c.json(
      await createBetaInvite(c.env, c.get("user")!, input, c.get("requestId")),
      201,
    );
  })
  .delete("/admin/beta-invites/:id", async (c) => {
    await revokeInvite(c.env.DB, c.req.param("id"));
    return c.body(null, 204);
  });
