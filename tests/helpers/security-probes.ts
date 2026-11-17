import type { createApp } from "../../src/api/app";
import { ROLE_RANK, ROLES, type Role } from "../../src/shared/constants";
import { openLimiter } from "../integration/pipeline/helpers";
import { api } from "./factory";
import { fillPath, splitRouteKey } from "./route-walk";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
  type TenantPair,
} from "./tenant-pair";

type App = ReturnType<typeof createApp>;

export type RoleRule = Role | { min: Role; self?: true };

export type TenancyRequest = {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
};

export type TenancyParams = Record<
  string,
  (pair: TenantPair) => TenancyRequest
>;

const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

async function errorCode(response: Response) {
  const json = (await response.json().catch(() => null)) as {
    error?: { code?: string };
  } | null;
  return json?.error?.code;
}

async function isForbiddenRole(response: Response) {
  return (
    response.status === 403 && (await errorCode(response)) === "FORBIDDEN_ROLE"
  );
}

export async function probeRoles(app: App, matrix: Record<string, RoleRule>) {
  const violations: string[] = [];
  for (const [key, rule] of Object.entries(matrix)) {
    const { method, path } = splitRouteKey(key);
    const min = typeof rule === "string" ? rule : rule.min;
    const allowsSelf = typeof rule !== "string" && rule.self === true;
    const { workspace, users } = await seedWorkspaceWithRoles();
    for (const role of ROLES) {
      const mustBeForbidden = ROLE_RANK[role] < ROLE_RANK[min];
      const response = await api(app, fillPath(path, { wid: workspace.id }), {
        as: users[role],
        method,
        env: openLimits,
      });
      if ((await isForbiddenRole(response)) !== mustBeForbidden) {
        violations.push(
          `${key} as ${role}: min ${min}, got ${response.status}`,
        );
      }
      if (allowsSelf && mustBeForbidden) {
        const selfResponse = await api(
          app,
          fillPath(path, { wid: workspace.id, userId: users[role].id }),
          { as: users[role], method, env: openLimits },
        );
        if (await isForbiddenRole(selfResponse)) {
          violations.push(`${key} as ${role} on self: got 403 FORBIDDEN_ROLE`);
        }
      }
    }
  }
  return violations;
}

export async function probeTenancy(app: App, paramsByRoute: TenancyParams) {
  const violations: string[] = [];
  const pair = await seedTenantPair();
  for (const [key, buildRequest] of Object.entries(paramsByRoute)) {
    const { method, path } = splitRouteKey(key);
    const { params, query, body } = buildRequest(pair);
    const queryString = new URLSearchParams(query).toString();
    const url = fillPath(path, { ...params, wid: pair.A.workspace.id });
    const response = await api(
      app,
      queryString ? `${url}?${queryString}` : url,
      { as: pair.A.users.owner, method, body, env: openLimits },
    );
    if (
      response.status !== 404 ||
      (await errorCode(response)) !== "NOT_FOUND"
    ) {
      violations.push(`${key}: foreign id got ${response.status}, want 404`);
    }
  }
  return violations;
}
