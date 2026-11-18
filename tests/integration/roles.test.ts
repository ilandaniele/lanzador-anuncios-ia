import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { createProbeApp, PROBE_ROUTES } from "../helpers/probe-app";
import { diffKeys, workspaceRouteKeys } from "../helpers/route-walk";
import { probeRoles } from "../helpers/security-probes";
import { ROLE_MATRIX } from "./roles.matrix";

const probeApp = createProbeApp();
const matrixKeys = Object.keys(ROLE_MATRIX);

describe("role matrix", { timeout: 30_000 }, () => {
  it("has a row for every workspace route and none extra", () => {
    expect(diffKeys(workspaceRouteKeys(createApp()), matrixKeys)).toEqual({
      missing: [],
      unexpected: [],
    });
  });

  it("enforces the minimum role on every row", async () => {
    expect(await probeRoles(createApp(), ROLE_MATRIX)).toEqual([]);
  });
});

describe("role harness self-check", () => {
  it("reports a route without a row", () => {
    expect(diffKeys(workspaceRouteKeys(probeApp), matrixKeys).missing).toEqual(
      expect.arrayContaining(Object.values(PROBE_ROUTES)),
    );
  });

  it("passes a route guarded by requireRole", async () => {
    expect(
      await probeRoles(probeApp, { [PROBE_ROUTES.correct]: "editor" }),
    ).toEqual([]);
  });

  it("detects a route without requireRole", async () => {
    expect(
      await probeRoles(probeApp, { [PROBE_ROUTES.noRole]: "editor" }),
    ).toHaveLength(1);
  });

  it("detects a wrong minimum role", async () => {
    expect(
      await probeRoles(probeApp, { [PROBE_ROUTES.correct]: "admin" }),
    ).not.toEqual([]);
  });
});
