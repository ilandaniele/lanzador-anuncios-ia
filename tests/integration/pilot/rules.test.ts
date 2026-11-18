import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { insertDefaultPilotRules } from "../../../src/api/repositories/pilot-rules";
import { auditLog } from "../../../src/db/schema/ops";
import { pilotRules } from "../../../src/db/schema/pilot";
import { MAX_SCALE_PERCENT } from "../../../src/shared/constants";
import {
  type PilotRule,
  pilotRulesResponseSchema,
} from "../../../src/shared/schemas/pilot";
import { api, expectError } from "../../helpers/factory";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
} from "../../helpers/tenant-pair";
import { openLimiter, readEnvelope } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

const rulesPath = (workspaceId: string) => `/api/w/${workspaceId}/pilot/rules`;

const seedWithDefaultRules = async () => {
  const seeded = await seedWorkspaceWithRoles();
  await insertDefaultPilotRules(env.DB, seeded.workspace.id, Date.now());
  return seeded;
};

const scaleWinner = (overrides: Record<string, unknown> = {}) => ({
  ruleType: "scale_winner",
  enabled: true,
  params: {
    breakEvenMultiplier: 1.5,
    fallbackMinRoas: 3,
    days: 5,
    minSpendMinor: 2000,
    percent: 20,
    minHoursBetween: 48,
    ...overrides,
  },
});

const pauseLowRoas = {
  ruleType: "pause_low_roas",
  enabled: true,
  params: {
    level: "adset",
    roasMax: 0.8,
    minSpendMinor: 5000,
    window: "daily:last_7d",
  },
};

const auditRowsOf = (workspaceId: string) =>
  db.select().from(auditLog).where(eq(auditLog.workspaceId, workspaceId));

const rowsOf = (workspaceId: string) =>
  db.select().from(pilotRules).where(eq(pilotRules.workspaceId, workspaceId));

describe("GET /api/w/:wid/pilot/rules", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWithDefaultRules();

    await expectError(
      await call(rulesPath(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("lets a viewer read the four default rules", async () => {
    const { workspace, users } = await seedWithDefaultRules();

    const response = await call(rulesPath(workspace.id), { as: users.viewer });

    expect(response.status).toBe(200);
    const { data } = pilotRulesResponseSchema.parse(await response.json());
    expect(
      Object.fromEntries(data.map((rule) => [rule.ruleType, rule.enabled])),
    ).toEqual({
      duplicate_winner: false,
      pause_low_roas: false,
      pause_no_sales: true,
      scale_winner: false,
    });
  });

  it("returns 404 to a non-member of the workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(rulesPath(A.workspace.id), { as: B.users.owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("does not leak rules updated in another workspace", async () => {
    const [a, b] = await Promise.all([
      seedWithDefaultRules(),
      seedWithDefaultRules(),
    ]);
    await call(rulesPath(a.workspace.id), {
      as: a.users.admin,
      method: "PUT",
      body: { rules: [scaleWinner()] },
    });

    const { data } = pilotRulesResponseSchema.parse(
      await (
        await call(rulesPath(b.workspace.id), { as: b.users.viewer })
      ).json(),
    );

    expect(
      data.find((rule: PilotRule) => rule.ruleType === "scale_winner"),
    ).toMatchObject({ enabled: false, params: { percent: 30 } });
  });
});

describe("PUT /api/w/:wid/pilot/rules", () => {
  it("returns 403 FORBIDDEN_ROLE for an editor and writes nothing", async () => {
    const { workspace, users } = await seedWithDefaultRules();

    await expectError(
      await call(rulesPath(workspace.id), {
        as: users.editor,
        method: "PUT",
        body: { rules: [scaleWinner()] },
      }),
      403,
      "FORBIDDEN_ROLE",
    );

    expect(await auditRowsOf(workspace.id)).toEqual([]);
  });

  it("updates only the sent rules and returns every rule", async () => {
    const { workspace, users } = await seedWithDefaultRules();

    const response = await call(rulesPath(workspace.id), {
      as: users.admin,
      method: "PUT",
      body: { rules: [scaleWinner(), pauseLowRoas] },
    });

    expect(response.status).toBe(200);
    const { data } = pilotRulesResponseSchema.parse(await response.json());
    expect(data).toHaveLength(4);
    expect(data).toEqual(
      expect.arrayContaining([
        scaleWinner(),
        pauseLowRoas,
        expect.objectContaining({ ruleType: "pause_no_sales", enabled: true }),
      ]),
    );
    const rows = await rowsOf(workspace.id);
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleType: "scale_winner",
          updatedBy: users.admin.id,
        }),
      ]),
    );
  });

  it("creates rules missing from the workspace", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(rulesPath(workspace.id), {
      as: users.owner,
      method: "PUT",
      body: { rules: [scaleWinner()] },
    });

    expect(response.status).toBe(200);
    expect(await rowsOf(workspace.id)).toHaveLength(1);
  });

  it("writes a pilot.rules.update audit entry", async () => {
    const { workspace, users } = await seedWithDefaultRules();

    await call(rulesPath(workspace.id), {
      as: users.admin,
      method: "PUT",
      body: { rules: [pauseLowRoas] },
    });

    const [entry] = await auditRowsOf(workspace.id);
    expect(entry).toMatchObject({
      action: "pilot.rules.update",
      actorUserId: users.admin.id,
      origin: "manual",
    });
    expect(JSON.parse(entry!.detail!)).toEqual({ rules: [pauseLowRoas] });
  });

  it("returns 422 SCALE_PERCENT_MAX_50 above the cap and writes nothing", async () => {
    const { workspace, users } = await seedWithDefaultRules();

    await expectError(
      await call(rulesPath(workspace.id), {
        as: users.admin,
        method: "PUT",
        body: {
          rules: [
            pauseLowRoas,
            scaleWinner({ percent: MAX_SCALE_PERCENT + 1 }),
          ],
        },
      }),
      422,
      "SCALE_PERCENT_MAX_50",
    );

    expect(await auditRowsOf(workspace.id)).toEqual([]);
    expect(
      (await rowsOf(workspace.id)).find(
        (row) => row.ruleType === "pause_low_roas",
      ),
    ).toMatchObject({ enabled: 0 });
  });

  it("accepts a scale percent exactly at the cap", async () => {
    const { workspace, users } = await seedWithDefaultRules();

    const response = await call(rulesPath(workspace.id), {
      as: users.admin,
      method: "PUT",
      body: { rules: [scaleWinner({ percent: MAX_SCALE_PERCENT })] },
    });

    expect(response.status).toBe(200);
  });

  it.each([
    [
      "an unknown rule type",
      { rules: [{ ruleType: "pause_everything", enabled: true, params: {} }] },
      "rules.0.ruleType",
    ],
    [
      "a param of the wrong type",
      { rules: [scaleWinner({ days: "three" })] },
      "rules.0.params.days",
    ],
    [
      "a missing param",
      {
        rules: [
          {
            ruleType: "duplicate_winner",
            enabled: true,
            params: { minRoas: 2, range: "last_7d" },
          },
        ],
      },
      "rules.0.params.minSpendMinor",
    ],
    [
      "a param of another rule type",
      { rules: [scaleWinner({ roasMax: 1 })] },
      "rules.0.params",
    ],
    [
      "a non-boolean enabled flag",
      { rules: [{ ...scaleWinner(), enabled: "yes" }] },
      "rules.0.enabled",
    ],
    [
      "a repeated rule type",
      { rules: [scaleWinner(), scaleWinner()] },
      "rules",
    ],
    ["an empty rule list", { rules: [] }, "rules"],
  ])("returns 400 VALIDATION with fields for %s", async (_, body, field) => {
    const { workspace, users } = await seedWithDefaultRules();

    const response = await call(rulesPath(workspace.id), {
      as: users.admin,
      method: "PUT",
      body,
    });

    expect(response.status).toBe(400);
    const error = await readEnvelope(response);
    expect(error.code).toBe("VALIDATION");
    expect(Object.keys(error.fields ?? {})).toContain(field);
    expect(await auditRowsOf(workspace.id)).toEqual([]);
  });
});
