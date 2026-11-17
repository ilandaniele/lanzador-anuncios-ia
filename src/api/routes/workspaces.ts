import { Hono } from "hono";
import type { Role } from "../../shared/constants";
import {
  deleteWorkspaceRequestSchema,
  settingsPatchSchema,
  workspaceNameRequestSchema,
} from "../../shared/schemas/workspaces";
import { parseJson } from "../lib/validate";
import { requireRole } from "../middleware/require-role";
import { session } from "../middleware/session";
import { workspace } from "../middleware/workspace";
import { getSettings, patchSettings } from "../services/settings";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceOverview,
  updateWorkspaceName,
} from "../services/workspaces";
import type { AppEnv } from "../types";

const member = (min: Role) =>
  [session({ required: true }), workspace(), requireRole(min)] as const;

export const workspaceRoutes = new Hono<AppEnv>()
  .post("/workspaces", session({ required: true }), async (c) => {
    const { name } = await parseJson(c, workspaceNameRequestSchema);
    return c.json(await createWorkspace(c.env.DB, c.get("user")!, name), 201);
  })
  .get("/w/:wid", ...member("viewer"), async (c) =>
    c.json(await getWorkspaceOverview(c.env, c.get("scope")!)),
  )
  .patch("/w/:wid", ...member("admin"), async (c) => {
    const { name } = await parseJson(c, workspaceNameRequestSchema);
    return c.json(await updateWorkspaceName(c.env.DB, c.get("scope")!, name));
  })
  .delete("/w/:wid", ...member("owner"), async (c) => {
    const { confirmName } = await parseJson(c, deleteWorkspaceRequestSchema);
    const purge = await deleteWorkspace(
      c.env.DB,
      c.get("scope")!,
      confirmName,
      c.get("requestId"),
    );
    return c.json(purge, 202);
  })
  .get("/w/:wid/settings", ...member("viewer"), async (c) =>
    c.json(await getSettings(c.env.DB, c.get("scope")!)),
  )
  .patch("/w/:wid/settings", ...member("admin"), async (c) => {
    const patch = await parseJson(c, settingsPatchSchema);
    return c.json(
      await patchSettings(c.env.DB, c.get("scope")!, patch, c.get("requestId")),
    );
  });
