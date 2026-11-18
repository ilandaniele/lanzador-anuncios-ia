import { createMiddleware } from "hono/factory";
import { AppError, notFound } from "../lib/errors";
import { HOUR_MS, now } from "../lib/time";
import { findWorkspaceAccess } from "../repositories/memberships";
import { touchWorkspaceActivity } from "../repositories/workspaces";
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

    const at = now();
    const staleBefore = at - HOUR_MS;
    if (access.lastActivityAt === null || access.lastActivityAt < staleBefore) {
      await touchWorkspaceActivity(c.env.DB, workspaceId, at, staleBefore);
    }

    c.set("scope", { workspaceId, userId: user.id, role: access.role });
    return next();
  });
