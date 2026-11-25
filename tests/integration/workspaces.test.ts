import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { insertWorkspaceWithDefaults } from "../../src/api/repositories/workspaces";
import { betaInvites } from "../../src/db/schema/auth";
import { auditLog, usageCounters } from "../../src/db/schema/ops";
import { pilotRules } from "../../src/db/schema/pilot";
import {
  memberships,
  workspaceSettings,
  workspaces,
} from "../../src/db/schema/workspaces";
import { MAX_OWNED_WORKSPACES } from "../../src/shared/constants";
import {
  createWorkspaceResponseSchema,
  deleteWorkspaceResponseSchema,
  type Settings,
  settingsSchema,
  type WorkspaceDto,
  type WorkspaceOverview,
  workspaceOverviewSchema,
} from "../../src/shared/schemas/workspaces";
import {
  api,
  createUser,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { seedTenantPair } from "../helpers/tenant-pair";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const jsonOf = async <T>(response: Response) => (await response.json()) as T;

const call = (path: string, options: Caller) =>
  api(app, path, { env: openLimits, ...options });

const post = (as: Caller["as"], name = "Mi marca") =>
  call("/api/workspaces", { as, method: "POST", body: { name } });

async function inviteUser(email = `${crypto.randomUUID()}@example.test`) {
  await db
    .insert(betaInvites)
    .values({ id: crypto.randomUUID(), email, createdAt: Date.now() });
  return createUser({ email });
}

const auditRowsOf = (workspaceId: string) =>
  db.select().from(auditLog).where(eq(auditLog.workspaceId, workspaceId));

describe("POST /api/workspaces", () => {
  it("returns 401 without a session", async () => {
    await expectError(await post(undefined), 401, "UNAUTHENTICATED");
  });

  it("returns 403 BETA_INVITE_REQUIRED without an invite", async () => {
    await expectError(
      await post(await createUser()),
      403,
      "BETA_INVITE_REQUIRED",
    );
  });

  it("returns 403 BETA_INVITE_REQUIRED for a revoked invite", async () => {
    const user = await inviteUser();
    await db
      .update(betaInvites)
      .set({ revokedAt: Date.now() })
      .where(eq(betaInvites.email, user.email));

    await expectError(await post(user), 403, "BETA_INVITE_REQUIRED");
  });

  it("lets a superadmin create without an invite", async () => {
    const superadmin = await createUser({ isSuperadmin: 1 });

    expect((await post(superadmin)).status).toBe(201);
  });

  it("creates workspace, owner, settings and default pilot rules", async () => {
    const user = await inviteUser();

    const response = await post(user, "  Mi marca  ");

    expect(response.status).toBe(201);
    const body = createWorkspaceResponseSchema.parse(await response.json());
    expect(body.workspace.name).toBe("Mi marca");
    expect(body.workspace.planId).toBe("beta");
    const id = body.workspace.id;
    const [member] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, id));
    expect(member).toMatchObject({ userId: user.id, role: "owner" });
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, id));
    expect(settings).toMatchObject({ maxCampaignBudgetMinor: 30000 });
    const rules = await db
      .select()
      .from(pilotRules)
      .where(eq(pilotRules.workspaceId, id));
    expect(
      Object.fromEntries(rules.map((r) => [r.ruleType, r.enabled])),
    ).toEqual({
      pause_no_sales: 1,
      pause_low_roas: 0,
      scale_winner: 0,
      duplicate_winner: 0,
    });
  });

  it("marks used_at on the first workspace and keeps it on the second", async () => {
    const user = await inviteUser();
    const invite = () =>
      db
        .select({ usedAt: betaInvites.usedAt })
        .from(betaInvites)
        .where(eq(betaInvites.email, user.email))
        .then(([row]) => row!.usedAt);

    await post(user);
    const firstUse = await invite();
    await post(user);

    expect(firstUse).toEqual(expect.any(Number));
    expect(await invite()).toBe(firstUse);
  });

  it("returns 422 WORKSPACE_LIMIT on the fourth workspace", async () => {
    const user = await inviteUser();
    for (let i = 0; i < MAX_OWNED_WORKSPACES; i++) {
      expect((await post(user)).status).toBe(201);
    }

    await expectError(await post(user), 422, "WORKSPACE_LIMIT");
  });

  it("enforces the limit in the database when the eligibility check races", async () => {
    const user = await inviteUser();
    for (let i = 0; i < MAX_OWNED_WORKSPACES; i++) {
      await createWorkspace({ owner: user });
    }

    const raced = await insertWorkspaceWithDefaults(
      env.DB,
      {
        id: crypto.randomUUID(),
        name: "Raced",
        ownerUserId: user.id,
        at: Date.now(),
      },
      user.email,
    );

    expect(raced).toBeNull();
  });

  it("does not count deleting workspaces toward the limit", async () => {
    const user = await inviteUser();
    await createWorkspace({ owner: user, status: "deleting" });
    for (let i = 0; i < MAX_OWNED_WORKSPACES; i++) {
      expect((await post(user)).status).toBe(201);
    }
  });

  it.each([{}, { name: "" }, { name: "   " }, { name: "x".repeat(81) }])(
    "returns 400 VALIDATION for body %j",
    async (body) => {
      const user = await inviteUser();

      const response = await call("/api/workspaces", {
        as: user,
        method: "POST",
        body,
      });

      await expectError(response, 400, "VALIDATION");
    },
  );
});

describe("GET /api/w/:wid", () => {
  it("returns the overview with the DTO shape", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    const response = await call(`/api/w/${workspace.id}`, { as: users.viewer });

    expect(response.status).toBe(200);
    const body = workspaceOverviewSchema.parse(await response.json());
    expect(body.role).toBe("viewer");
    expect(body.workspace.id).toBe(workspace.id);
    expect(body.plan).toMatchObject({
      id: "beta",
      name: "Beta",
      limits: { aiDailyNeurons: 2000, aiMonthlyNeurons: 30000 },
    });
    expect(body.settings.maxScalePercent).toBe(50);
    expect(body.aiUsage).toMatchObject({
      neuronsToday: 0,
      dailyCap: 2000,
      neuronsMonth: 0,
      monthlyCap: 30000,
      globalExhausted: false,
    });
    expect(new Date(body.aiUsage.resetsAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("does not leak internal fields", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    const body = await jsonOf<WorkspaceOverview>(
      await call(`/api/w/${workspace.id}`, { as: users.owner }),
    );

    expect(Object.keys(body.workspace).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "planId",
      "status",
    ]);
  });

  it("reports counters, overrides and the global cap in aiUsage", async () => {
    const { workspace, users } = (await seedTenantPair()).A;
    const day = new Date().toISOString().slice(0, 10);
    const at = Date.now();
    await db
      .update(workspaces)
      .set({ aiDailyNeuronsOverride: 500 })
      .where(eq(workspaces.id, workspace.id));
    await db.insert(usageCounters).values([
      {
        scope: "workspace",
        scopeId: workspace.id,
        period: day,
        metric: "ai_neurons",
        value: 120,
        updatedAt: at,
      },
      {
        scope: "workspace",
        scopeId: workspace.id,
        period: day.slice(0, 7),
        metric: "ai_neurons",
        value: 900,
        updatedAt: at,
      },
      {
        scope: "global",
        scopeId: "app",
        period: day,
        metric: "ai_neurons",
        value: 9000,
        updatedAt: at,
      },
    ]);

    const response = await call(`/api/w/${workspace.id}`, {
      as: users.viewer,
    });

    expect(
      workspaceOverviewSchema.parse(await response.json()).aiUsage,
    ).toMatchObject({
      neuronsToday: 120,
      dailyCap: 500,
      neuronsMonth: 900,
      monthlyCap: 30000,
      globalExhausted: true,
    });
    await db.delete(usageCounters).where(eq(usageCounters.scope, "global"));
  });

  it("returns 404 for a non-member", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(`/api/w/${B.workspace.id}`, { as: A.users.owner }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("PATCH /api/w/:wid", () => {
  it("renames the workspace", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    const response = await call(`/api/w/${workspace.id}`, {
      as: users.admin,
      method: "PATCH",
      body: { name: " Nuevo nombre " },
    });

    expect(response.status).toBe(200);
    expect(
      (await jsonOf<{ workspace: WorkspaceDto }>(response)).workspace,
    ).toMatchObject({
      id: workspace.id,
      name: "Nuevo nombre",
    });
  });

  it("returns 400 VALIDATION for an empty name", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(`/api/w/${workspace.id}`, {
        as: users.admin,
        method: "PATCH",
        body: { name: "" },
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 403 FORBIDDEN_ROLE for an editor", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(`/api/w/${workspace.id}`, {
        as: users.editor,
        method: "PATCH",
        body: { name: "x" },
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 404 for another tenant", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(`/api/w/${B.workspace.id}`, {
        as: A.users.owner,
        method: "PATCH",
        body: { name: "x" },
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("DELETE /api/w/:wid", () => {
  it("returns 422 CONFIRM_MISMATCH and keeps the workspace", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(`/api/w/${workspace.id}`, {
        as: users.owner,
        method: "DELETE",
        body: { confirmName: "otro nombre" },
      }),
      422,
      "CONFIRM_MISMATCH",
    );
    expect(
      (await call(`/api/w/${workspace.id}`, { as: users.owner })).status,
    ).toBe(200);
  });

  it("returns 400 VALIDATION without confirmName", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(`/api/w/${workspace.id}`, {
        as: users.owner,
        method: "DELETE",
        body: {},
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 403 FORBIDDEN_ROLE for an admin", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(`/api/w/${workspace.id}`, {
        as: users.admin,
        method: "DELETE",
        body: { confirmName: workspace.name },
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 202 with purgeAfter, audits, and then 404s", async () => {
    const { workspace, users } = (await seedTenantPair()).A;
    const before = Date.now();

    const response = await call(`/api/w/${workspace.id}`, {
      as: users.owner,
      method: "DELETE",
      body: { confirmName: workspace.name },
    });

    expect(response.status).toBe(202);
    const { purgeAfter } = deleteWorkspaceResponseSchema.parse(
      await response.json(),
    );
    const delayMs = new Date(purgeAfter).getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(7 * 24 * 3_600_000);
    expect(delayMs).toBeLessThan(7 * 24 * 3_600_000 + 60_000);
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id));
    expect(row).toMatchObject({ status: "deleting" });
    expect(row!.deletedAt).toEqual(expect.any(Number));
    expect(await auditRowsOf(workspace.id)).toMatchObject([
      {
        action: "workspace.delete",
        actorUserId: users.owner.id,
        actorType: "user",
        origin: "manual",
        objectType: "workspace",
        objectName: workspace.name,
        result: "ok",
      },
    ]);
    await expectError(
      await call(`/api/w/${workspace.id}`, { as: users.owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for another tenant", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(`/api/w/${B.workspace.id}`, {
        as: A.users.owner,
        method: "DELETE",
        body: { confirmName: B.workspace.name },
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("settings", () => {
  const settingsPath = (workspaceId: string) =>
    `/api/w/${workspaceId}/settings`;

  it("returns the settings DTO to a viewer", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    const response = await call(settingsPath(workspace.id), {
      as: users.viewer,
    });

    expect(response.status).toBe(200);
    expect(settingsSchema.parse(await response.json())).toMatchObject({
      maxCampaignBudgetMinor: 30000,
      budgetCurrency: "USD",
      maxScalePercent: 50,
      advantageCreativeEnabled: false,
      timezone: "America/Argentina/Buenos_Aires",
      defaultCountries: ["AR"],
      nameTemplates: {
        campaign: "CBO {fecha}",
        adset: "CONJ {n}",
        ad: "{hook}-{formato}-{angulo}-{n}",
      },
      launchDefaults: { objective: "OUTCOME_SALES" },
    });
  });

  it("applies a partial patch and keeps the other fields", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    const response = await call(settingsPath(workspace.id), {
      as: users.admin,
      method: "PATCH",
      body: {
        maxScalePercent: 30,
        advantageCreativeEnabled: true,
        nameTemplates: { ad: "{n}" },
      },
    });

    expect(response.status).toBe(200);
    const { settings } = await jsonOf<{ settings: Settings }>(response);
    expect(settingsSchema.parse(settings)).toMatchObject({
      maxScalePercent: 30,
      advantageCreativeEnabled: true,
      maxCampaignBudgetMinor: 30000,
      timezone: "America/Argentina/Buenos_Aires",
      nameTemplates: { campaign: "CBO {fecha}", adset: "CONJ {n}", ad: "{n}" },
    });
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspace.id));
    expect(row).toMatchObject({ updatedBy: users.admin.id });
  });

  it("writes a settings.update audit entry with the changed fields", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await call(settingsPath(workspace.id), {
      as: users.admin,
      method: "PATCH",
      body: { maxCampaignBudgetMinor: 5000 },
    });

    const [entry] = await auditRowsOf(workspace.id);
    expect(entry).toMatchObject({
      action: "settings.update",
      actorUserId: users.admin.id,
      origin: "manual",
    });
    expect(JSON.parse(entry!.detail!)).toEqual({
      changes: { maxCampaignBudgetMinor: 5000 },
    });
  });

  it("returns 422 SCALE_PERCENT_MAX_50 and writes nothing", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(settingsPath(workspace.id), {
        as: users.admin,
        method: "PATCH",
        body: { maxScalePercent: 51, maxCampaignBudgetMinor: 1 },
      }),
      422,
      "SCALE_PERCENT_MAX_50",
    );

    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspace.id));
    expect(row).toMatchObject({
      maxScalePercent: 50,
      maxCampaignBudgetMinor: 30000,
    });
    expect(await auditRowsOf(workspace.id)).toEqual([]);
  });

  it.each([
    {},
    { maxScalePercent: 0 },
    { maxCampaignBudgetMinor: -1 },
    { budgetCurrency: "usd" },
    { timezone: "Mars/Olympus" },
    { defaultCountries: [] },
    { defaultCountries: ["ARG"] },
    { nameTemplates: { ad: "" } },
    { advantageCreativeEnabled: "yes" },
  ])("returns 400 VALIDATION for patch %j", async (body) => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(settingsPath(workspace.id), {
        as: users.admin,
        method: "PATCH",
        body,
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 403 FORBIDDEN_ROLE for an editor patching", async () => {
    const { workspace, users } = (await seedTenantPair()).A;

    await expectError(
      await call(settingsPath(workspace.id), {
        as: users.editor,
        method: "PATCH",
        body: { maxScalePercent: 10 },
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 404 on another tenant for read and write", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(settingsPath(B.workspace.id), { as: A.users.owner }),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await call(settingsPath(B.workspace.id), {
        as: A.users.owner,
        method: "PATCH",
        body: { maxScalePercent: 10 },
      }),
      404,
      "NOT_FOUND",
    );
  });
});
