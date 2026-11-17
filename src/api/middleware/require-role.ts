import { createMiddleware } from "hono/factory";
import { ROLE_RANK, type Role } from "../../shared/constants";
import { forbiddenRole, notFound } from "../lib/errors";
import type { AppEnv } from "../types";

export const requireRole = (min: Role) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const scope = c.get("scope");
    if (!scope) throw notFound();
    if (ROLE_RANK[scope.role] < ROLE_RANK[min]) throw forbiddenRole();
    return next();
  });

export const requireSuperadmin = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get("user")?.isSuperadmin) throw notFound();
    return next();
  });
