import { createMiddleware } from "hono/factory";
import { isBillingBlocked } from "../../shared/billing";
import { AppError, notFound } from "../lib/errors";
import { HOUR_MS, now } from "../lib/time";
import { toBillingState } from "../repositories/billing-access";
import { findWorkspaceAccess } from "../repositories/memberships";
import { touchWorkspaceActivity } from "../repositories/workspaces";
import type { AppEnv } from "../types";

export type WorkspaceOptions = { billingExempt?: boolean };

export const workspace = ({ billingExempt = false }: WorkspaceOptions = {}) =>
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
    if (!billingExempt && isBillingBlocked(toBillingState(access), at)) {
      throw new AppError(402, "PAYMENT_REQUIRED");
    }

    const staleBefore = at - HOUR_MS;
    if (access.lastActivityAt === null || access.lastActivityAt < staleBefore) {
      await touchWorkspaceActivity(c.env.DB, workspaceId, at, staleBefore);
    }

    c.set("scope", { workspaceId, userId: user.id, role: access.role });
    return next();
  });
