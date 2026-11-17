import { createMiddleware } from "hono/factory";
import { AppError, notFound } from "../lib/errors";
import { findWorkspaceAccess } from "../repositories/memberships";
import type { AppEnv } from "../types";

export const workspace = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw new AppError(401, "UNAUTHENTICATED");

    const workspaceId = c.req.param("wid")!;
    const access = await findWorkspaceAccess(c.env.DB, workspaceId, user.id);
    if (!access?.role || access.status === "deleting") throw notFound();
    if (access.status === "disabled") {
      throw new AppError(403, "WORKSPACE_DISABLED");
    }

    c.set("scope", { workspaceId, userId: user.id, role: access.role });
    return next();
  });
