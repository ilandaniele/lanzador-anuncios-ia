/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import spaHeaders from "../../public/_headers?raw";
import { createApp } from "../../src/api/app";
import type { Env } from "../../src/api/env";
import { fillPath, routeKeys, splitRouteKey } from "../helpers/route-walk";
import {
  blockedLimiter,
  openLimiter,
  ORIGIN,
  testEnv,
  trustedHeaders,
} from "./pipeline/helpers";

const FOREIGN_ORIGIN = "https://evil.example.test";
const BASE_URL = "http://example.com";

const REQUIRED_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const SPA_REQUIRED_HEADERS = [
  "Content-Security-Policy: default-src 'self';",
  "frame-ancestors 'none'",
  "style-src 'self' 'unsafe-inline';",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
];

const app = createApp();
const routes = routeKeys(app);
const openEnv = { RL_IP: openLimiter } satisfies Partial<Env>;

const send = (
  method: string,
  path: string,
  headers: Record<string, string>,
  overrides: Partial<Env> = openEnv,
) =>
  app.request(
    `${BASE_URL}${fillPath(path, {})}`,
    { method, headers },
    testEnv(overrides),
  );

const requiredHeaders = (response: Response) =>
  Object.fromEntries(
    Object.keys(REQUIRED_HEADERS).map((name) => [
      name,
      response.headers.get(name),
    ]),
  );

const corsHeaders = (response: Response) =>
  [...response.headers.keys()].filter((name) =>
    name.toLowerCase().startsWith("access-control-"),
  );

function expectHardened(response: Response) {
  expect(requiredHeaders(response)).toEqual(REQUIRED_HEADERS);
  expect(corsHeaders(response)).toEqual([]);
  expect(response.headers.get("X-Powered-By")).toBeNull();
}

describe("security headers", { timeout: 60_000 }, () => {
  it("finds every API route", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it.each(routes)("%s is hardened for a foreign origin", async (key) => {
    const { method, path } = splitRouteKey(key);

    const response = await send(method, path, { Origin: FOREIGN_ORIGIN });

    expectHardened(response);
  });

  it.each(routes)("%s rejects a CORS preflight", async (key) => {
    const { method, path } = splitRouteKey(key);

    const response = await send("OPTIONS", path, {
      Origin: FOREIGN_ORIGIN,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": "content-type, x-lanzador",
    });

    expect(response.status).toBe(403);
    expectHardened(response);
  });

  it("does not grant CORS to the app origin either", async () => {
    const response = await send("GET", "/api/health", { Origin: ORIGIN });

    expect(response.status).toBe(200);
    expectHardened(response);
  });

  it("hardens success, 401, 403, 404 and 429 responses", async () => {
    const responses = await Promise.all([
      send("GET", "/api/health", {}),
      send("GET", "/api/me", trustedHeaders),
      send("POST", "/api/auth/logout", { Origin: FOREIGN_ORIGIN }),
      send("GET", "/api/does-not-exist", {}),
      send("GET", "/api/health", {}, { RL_IP: blockedLimiter }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([
      200, 401, 403, 404, 429,
    ]);
    responses.forEach(expectHardened);
  });

  it("hardens an unexpected 500 without echoing the error", async () => {
    const failing = createApp();
    failing.get("/boom", () => {
      throw new Error("boom-detail");
    });

    const response = await failing.request(
      `${BASE_URL}/api/boom`,
      {},
      testEnv(openEnv),
    );

    expect(response.status).toBe(500);
    expectHardened(response);
    expect(await response.text()).not.toContain("boom-detail");
  });

  it("ships the SPA security headers", () => {
    expect(
      SPA_REQUIRED_HEADERS.filter((header) => !spaHeaders.includes(header)),
    ).toEqual([]);
    expect(spaHeaders).not.toMatch(/Access-Control-Allow-Origin/i);
    expect(spaHeaders).not.toMatch(/'unsafe-eval'/);
    expect(spaHeaders).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(spaHeaders.match(/'unsafe-inline'/g)).toHaveLength(1);
  });
});
