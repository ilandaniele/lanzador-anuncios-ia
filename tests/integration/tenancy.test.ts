import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { createProbeApp, PROBE_ROUTES } from "../helpers/probe-app";
import { diffKeys, idRouteKeys } from "../helpers/route-walk";
import { probeTenancy } from "../helpers/security-probes";
import type { TenantPair } from "../helpers/tenant-pair";
import { TENANCY_PARAMS } from "./tenancy.params";

const probeApp = createProbeApp();
const foreignId = ({ B }: TenantPair) => ({ params: { id: B.workspace.id } });

describe("tenancy", () => {
  it("has params for every workspace route with an id and none extra", () => {
    expect(
      diffKeys(idRouteKeys(createApp()), Object.keys(TENANCY_PARAMS)),
    ).toEqual({ missing: [], unexpected: [] });
  });

  it("answers 404 to foreign ids on every id route", async () => {
    expect(await probeTenancy(createApp(), TENANCY_PARAMS)).toEqual([]);
  });
});

describe("tenancy harness self-check", () => {
  it("reports an id route without params", () => {
    expect(
      diffKeys(idRouteKeys(probeApp), Object.keys(TENANCY_PARAMS)).missing,
    ).toEqual(Object.values(PROBE_ROUTES).sort());
  });

  it("passes a route that scopes its lookup", async () => {
    expect(
      await probeTenancy(probeApp, { [PROBE_ROUTES.correct]: foreignId }),
    ).toEqual([]);
  });

  it("detects a route that ignores the scope", async () => {
    expect(
      await probeTenancy(probeApp, { [PROBE_ROUTES.unscoped]: foreignId }),
    ).toHaveLength(1);
  });
});
