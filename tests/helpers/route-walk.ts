import type { createApp } from "../../src/api/app";

type App = ReturnType<typeof createApp>;

const WORKSPACE_PREFIX = "/api/w/:wid";
const PARAM = /:(\w+)/g;

export const routeKey = (method: string, path: string) => `${method} ${path}`;

export const splitRouteKey = (key: string) => {
  const [method = "", path = ""] = key.split(" ");
  return { method, path };
};

export function workspaceRouteKeys(app: App): string[] {
  const keys = app.routes
    .filter(({ method, path }) => method !== "ALL" && !path.endsWith("*"))
    .filter(({ path }) => path.startsWith(WORKSPACE_PREFIX))
    .map(({ method, path }) => routeKey(method, path));
  return [...new Set(keys)].sort();
}

const idParams = (path: string) =>
  [...path.matchAll(PARAM)].map(([, name]) => name).filter((n) => n !== "wid");

export const idRouteKeys = (app: App) =>
  workspaceRouteKeys(app).filter(
    (key) => idParams(splitRouteKey(key).path).length > 0,
  );

export function diffKeys(routeKeys: string[], rowKeys: string[]) {
  return {
    missing: routeKeys.filter((key) => !rowKeys.includes(key)).sort(),
    unexpected: rowKeys.filter((key) => !routeKeys.includes(key)).sort(),
  };
}

export const fillPath = (path: string, values: Record<string, string>) =>
  path.replace(PARAM, (_, name: string) => values[name] ?? crypto.randomUUID());
