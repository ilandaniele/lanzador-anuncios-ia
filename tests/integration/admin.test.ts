import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import type { Env } from "../../src/api/env";
import { newId } from "../../src/api/lib/ids";
import { utcPeriods } from "../../src/api/lib/time";
import { findMagicLinkAccess } from "../../src/api/repositories/magic-links";
import { betaInvites, plans } from "../../src/db/schema/auth";
import { metaConnections } from "../../src/db/schema/meta";
import { auditLog, usageCounters } from "../../src/db/schema/ops";
import { workspaces } from "../../src/db/schema/workspaces";
import type { WorkspaceStatus } from "../../src/shared/constants";
import {
  adminWorkspaceResponseSchema,
  adminWorkspacesPageSchema,
  betaInviteResponseSchema,
  betaInvitesPageSchema,
} from "../../src/shared/schemas/admin";
import {
  api,
  createUser,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { graphUrl, metaFails } from "../helpers/msw/meta";
import { resendServerError, resendSuccess } from "../helpers/msw/resend";
import { server } from "../helpers/msw/server";
import { openLimiter } from "./pipeline/helpers";

const DAY = 24 * 60 * 60 * 1000;

const app = createApp();
const db = drizzle(env.DB);
const baseEnv: Partial<Env> = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_AUTH: openLimiter,
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Lanzador <login@example.test>",
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { ...options, env: { ...baseEnv, ...options.env } });

const superadmin = () => createUser({ isSuperadmin: 1 });

const uniqueEmail = () => `${crypto.randomUUID()}@example.test`;

const workspacePath = (id: string) => `/api/admin/workspaces/${id}`;

const patchWorkspace = (as: Caller["as"], id: string, body: unknown) =>
  call(workspacePath(id), { as, method: "PATCH", body });

const workspaceRow = (id: string) =>
  db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .then(([row]) => row!);

const auditRows = (workspaceId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.action, action)),
    );

const seedWorkspace = async (
  options: { status?: WorkspaceStatus; deletedAt?: number } = {},
) => {
  const { workspace, owner } = await createWorkspace({
    status: options.status,
  });
  if (options.deletedAt !== undefined) {
    await db
      .update(workspaces)
      .set({ deletedAt: options.deletedAt })
      .where(eq(workspaces.id, workspace.id));
  }
  return { workspace, owner };
};

const seedBetaInvite = async (
  overrides: Partial<typeof betaInvites.$inferInsert> = {},
) => {
  const id = newId();
  const invite = {
    id,
    email: `${id}@example.test`,
    createdAt: Date.now(),
    ...overrides,
  };
  await db.insert(betaInvites).values(invite);
  return invite;
};

const betaInviteRow = (id: string) =>
  db
    .select()
    .from(betaInvites)
    .where(eq(betaInvites.id, id))
    .then(([row]) => row!);

const seedNeurons = (workspaceId: string, period: string, value: number) =>
  db.insert(usageCounters).values({
    scope: "workspace",
    scopeId: workspaceId,
    period,
    metric: "ai_neurons",
    value,
    updatedAt: Date.now(),
  });

const seedConnection = (
  workspaceId: string,
  status: "active" | "reconnect_required",
) =>
  db.insert(metaConnections).values({
    id: newId(),
    workspaceId,
    metaBusinessId: crypto.randomUUID(),
    metaUserId: "meta-user",
    tokenCiphertext: Buffer.from([1]),
    tokenIv: Buffer.from([1]),
    tokenKeyVersion: 1,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

const captureEmails = () => {
  const requests: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
};

async function collectIds(path: string, as: Caller["as"], limit: number) {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const query = `limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`;
    const response = await call(`${path}?${query}`, { as });
    expect(response.status).toBe(200);
    const page = (await response.json()) as {
      data: { id: string }[];
      nextCursor: string | null;
    };
    pages.push(page.data.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  return pages;
}

afterEach(() => {
  server.events.removeAllListeners();
});

const ADMIN_ROUTES: [string, string, unknown?][] = [
  ["GET", "/api/admin/workspaces"],
  ["PATCH", `/api/admin/workspaces/${crypto.randomUUID()}`, { planId: "beta" }],
  ["GET", "/api/admin/beta-invites"],
  ["POST", "/api/admin/beta-invites", { email: "someone@example.test" }],
  ["DELETE", `/api/admin/beta-invites/${crypto.randomUUID()}`],
  ["POST", "/api/admin/meta-testers", { facebookUserId: "100012345678" }],
];

describe("admin access", () => {
  it.each(ADMIN_ROUTES)(
    "%s %s returns 401 without a session",
    async (method, path, body) => {
      await expectError(
        await call(path, { method, body }),
        401,
        "UNAUTHENTICATED",
      );
    },
  );

  it.each(ADMIN_ROUTES)(
    "%s %s returns 404 to a non-superadmin",
    async (method, path, body) => {
      const { owner } = await seedWorkspace();

      await expectError(
        await call(path, { as: owner, method, body }),
        404,
        "NOT_FOUND",
      );
    },
  );
});

describe("GET /api/admin/workspaces", () => {
  it("lists the exact DTO with member count, owner email and activity", async () => {
    const admin = await superadmin();
    const { workspace, owner } = await seedWorkspace();
    const activityAt = Date.now() - DAY;
    await db
      .update(workspaces)
      .set({ lastActivityAt: activityAt })
      .where(eq(workspaces.id, workspace.id));

    const response = await call("/api/admin/workspaces?limit=100", {
      as: admin,
    });

    expect(response.status).toBe(200);
    const page = adminWorkspacesPageSchema.parse(await response.json());
    const item = page.data.find(({ id }) => id === workspace.id)!;
    expect(Object.keys(item).sort()).toEqual([
      "aiNeuronsMonth",
      "createdAt",
      "id",
      "lastActivityAt",
      "memberCount",
      "metaStatus",
      "name",
      "ownerEmail",
      "planId",
      "status",
    ]);
    expect(item).toMatchObject({
      name: workspace.name,
      status: "active",
      planId: "beta",
      ownerEmail: owner.email,
      memberCount: 1,
      lastActivityAt: new Date(activityAt).toISOString(),
      metaStatus: null,
      aiNeuronsMonth: 0,
    });
  });

  it("counts members and returns null activity when never active", async () => {
    const admin = await superadmin();
    const viewer = await createUser();
    const { workspace } = await createWorkspace({
      members: [{ user: viewer, role: "viewer" }],
    });

    const page = adminWorkspacesPageSchema.parse(
      await (
        await call("/api/admin/workspaces?limit=100", { as: admin })
      ).json(),
    );

    expect(page.data.find(({ id }) => id === workspace.id)).toMatchObject({
      memberCount: 2,
      lastActivityAt: null,
    });
  });

  it("reports the Meta connection status", async () => {
    const admin = await superadmin();
    const [none, healthy, broken] = await Promise.all([
      seedWorkspace(),
      seedWorkspace(),
      seedWorkspace(),
    ]);
    await seedConnection(healthy.workspace.id, "active");
    await seedConnection(healthy.workspace.id, "reconnect_required");
    await seedConnection(broken.workspace.id, "reconnect_required");

    const page = adminWorkspacesPageSchema.parse(
      await (
        await call("/api/admin/workspaces?limit=100", { as: admin })
      ).json(),
    );

    const metaStatusOf = (id: string) =>
      page.data.find((item) => item.id === id)!.metaStatus;
    expect(metaStatusOf(none.workspace.id)).toBeNull();
    expect(metaStatusOf(healthy.workspace.id)).toBe("active");
    expect(metaStatusOf(broken.workspace.id)).toBe("reconnect_required");
  });

  it("reports the neurons of the current month only", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace();
    const { month } = utcPeriods(Date.now());
    await seedNeurons(workspace.id, month, 321);
    await seedNeurons(workspace.id, "2001-01", 999);

    const page = adminWorkspacesPageSchema.parse(
      await (
        await call("/api/admin/workspaces?limit=100", { as: admin })
      ).json(),
    );

    expect(
      page.data.find(({ id }) => id === workspace.id)!.aiNeuronsMonth,
    ).toBe(321);
  });

  it("filters by status", async () => {
    const admin = await superadmin();
    const active = await seedWorkspace();
    const disabled = await seedWorkspace({ status: "disabled" });

    const page = adminWorkspacesPageSchema.parse(
      await (
        await call("/api/admin/workspaces?status=disabled&limit=100", {
          as: admin,
        })
      ).json(),
    );

    const ids = page.data.map(({ id }) => id);
    expect(ids).toContain(disabled.workspace.id);
    expect(ids).not.toContain(active.workspace.id);
    expect(page.data.every(({ status }) => status === "disabled")).toBe(true);
  });

  it("rejects an unknown status filter and an oversized limit with 400", async () => {
    const admin = await superadmin();

    await expectError(
      await call("/api/admin/workspaces?status=bogus", { as: admin }),
      400,
      "VALIDATION",
    );
    await expectError(
      await call("/api/admin/workspaces?limit=101", { as: admin }),
      400,
      "VALIDATION",
    );
  });

  it("paginates by cursor without gaps or repeats", async () => {
    const admin = await superadmin();
    const created = (
      await Promise.all([seedWorkspace(), seedWorkspace(), seedWorkspace()])
    ).map(({ workspace }) => workspace.id);

    const pages = await collectIds("/api/admin/workspaces", admin, 2);

    const all = pages.flat();
    expect(pages[0]).toHaveLength(2);
    expect(pages.length).toBeGreaterThan(1);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual([...all].sort());
    expect(all).toEqual(expect.arrayContaining(created));
  });
});

describe("PATCH /api/admin/workspaces/:id", () => {
  it("returns 404 for an unknown workspace", async () => {
    const admin = await superadmin();

    await expectError(
      await patchWorkspace(admin, crypto.randomUUID(), { planId: "beta" }),
      404,
      "NOT_FOUND",
    );
  });

  it("rejects invalid bodies with 400", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace();
    const invalidBodies = [
      {},
      { status: "deleting" },
      { status: "bogus" },
      { disabledReason: "no status" },
      { status: "active", disabledReason: "not disabling" },
      { aiDailyNeuronsOverride: -1 },
      { aiMonthlyNeuronsOverride: 1.5 },
      { aiDailyNeuronsOverride: "100" },
    ];

    for (const body of invalidBodies) {
      await expectError(
        await patchWorkspace(admin, workspace.id, body),
        400,
        "VALIDATION",
      );
    }
  });

  it("returns the exact DTO and no internal fields", async () => {
    const admin = await superadmin();
    const { workspace, owner } = await seedWorkspace();

    const response = await patchWorkspace(admin, workspace.id, {
      aiDailyNeuronsOverride: 10,
    });

    expect(response.status).toBe(200);
    const body = adminWorkspaceResponseSchema.parse(await response.json());
    expect(Object.keys(body)).toEqual(["workspace"]);
    expect(Object.keys(body.workspace).sort()).toEqual([
      "aiNeuronsMonth",
      "createdAt",
      "id",
      "lastActivityAt",
      "memberCount",
      "metaStatus",
      "name",
      "ownerEmail",
      "planId",
      "status",
    ]);
    expect(body.workspace).toMatchObject({
      id: workspace.id,
      ownerEmail: owner.email,
      memberCount: 1,
    });
  });

  it("saves and clears the neuron overrides", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace();

    const saved = await patchWorkspace(admin, workspace.id, {
      aiDailyNeuronsOverride: 100,
      aiMonthlyNeuronsOverride: 0,
    });

    expect(saved.status).toBe(200);
    expect(await workspaceRow(workspace.id)).toMatchObject({
      aiDailyNeuronsOverride: 100,
      aiMonthlyNeuronsOverride: 0,
    });

    const partial = await patchWorkspace(admin, workspace.id, {
      aiDailyNeuronsOverride: null,
    });

    expect(partial.status).toBe(200);
    expect(await workspaceRow(workspace.id)).toMatchObject({
      aiDailyNeuronsOverride: null,
      aiMonthlyNeuronsOverride: 0,
    });

    await patchWorkspace(admin, workspace.id, {
      aiMonthlyNeuronsOverride: null,
    });

    expect(await workspaceRow(workspace.id)).toMatchObject({
      aiDailyNeuronsOverride: null,
      aiMonthlyNeuronsOverride: null,
    });
  });

  it("changes the plan and rejects an unknown plan", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace();
    const planId = `plan-${crypto.randomUUID()}`;
    await db
      .insert(plans)
      .values({ id: planId, name: planId, createdAt: Date.now() });

    const changed = await patchWorkspace(admin, workspace.id, { planId });

    expect(changed.status).toBe(200);
    expect((await changed.json()) as { workspace: { planId: string } }).toEqual(
      { workspace: expect.objectContaining({ planId }) },
    );
    expect((await workspaceRow(workspace.id)).planId).toBe(planId);

    await expectError(
      await patchWorkspace(admin, workspace.id, { planId: "missing" }),
      400,
      "VALIDATION",
    );
    expect((await workspaceRow(workspace.id)).planId).toBe(planId);
  });

  it("disables with a reason and writes a superadmin audit entry", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace();

    const response = await patchWorkspace(admin, workspace.id, {
      status: "disabled",
      disabledReason: "  Pago pendiente ",
    });

    expect(response.status).toBe(200);
    expect(adminWorkspaceResponseSchema.parse(await response.json())).toEqual({
      workspace: expect.objectContaining({ status: "disabled" }),
    });
    expect(await workspaceRow(workspace.id)).toMatchObject({
      status: "disabled",
      disabledReason: "Pago pendiente",
    });
    const [audit] = await auditRows(workspace.id, "workspace.disable");
    expect(audit).toMatchObject({
      actorUserId: admin.id,
      actorType: "superadmin",
      origin: "manual",
      objectType: "workspace",
    });
    expect(JSON.parse(audit!.detail!)).toEqual({ reason: "Pago pendiente" });
  });

  it("blocks member access once disabled and clears the reason on enable", async () => {
    const admin = await superadmin();
    const { workspace, owner } = await seedWorkspace();

    await patchWorkspace(admin, workspace.id, {
      status: "disabled",
      disabledReason: "Abuso",
    });
    await expectError(
      await call(`/api/w/${workspace.id}`, { as: owner }),
      403,
      "WORKSPACE_DISABLED",
    );

    const enabled = await patchWorkspace(admin, workspace.id, {
      status: "active",
    });

    expect(enabled.status).toBe(200);
    expect(await workspaceRow(workspace.id)).toMatchObject({
      status: "active",
      disabledReason: null,
    });
    expect((await call(`/api/w/${workspace.id}`, { as: owner })).status).toBe(
      200,
    );
    expect(await auditRows(workspace.id, "workspace.disable")).toHaveLength(1);
  });

  it("restores a deleting workspace deleted 6 days ago", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace({
      status: "deleting",
      deletedAt: Date.now() - 6 * DAY,
    });

    const response = await patchWorkspace(admin, workspace.id, {
      status: "active",
    });

    expect(response.status).toBe(200);
    expect(adminWorkspaceResponseSchema.parse(await response.json())).toEqual({
      workspace: expect.objectContaining({ status: "active" }),
    });
    expect(await workspaceRow(workspace.id)).toMatchObject({
      status: "active",
      deletedAt: null,
    });
  });

  it("refuses to restore a workspace whose owner already owns three", async () => {
    const admin = await superadmin();
    const { workspace, owner } = await seedWorkspace({
      status: "deleting",
      deletedAt: Date.now() - DAY,
    });
    for (let index = 0; index < 3; index += 1) {
      await createWorkspace({ owner });
    }

    const response = await patchWorkspace(admin, workspace.id, {
      status: "active",
    });

    await expectError(response, 422, "WORKSPACE_LIMIT");
    expect((await workspaceRow(workspace.id)).status).toBe("deleting");
  });

  it("refuses to restore a deleting workspace deleted 8 days ago", async () => {
    const admin = await superadmin();
    const deletedAt = Date.now() - 8 * DAY;
    const { workspace } = await seedWorkspace({
      status: "deleting",
      deletedAt,
    });

    await expectError(
      await patchWorkspace(admin, workspace.id, { status: "active" }),
      422,
      "INVALID_STATUS",
    );

    expect(await workspaceRow(workspace.id)).toMatchObject({
      status: "deleting",
      deletedAt,
    });
  });

  it("refuses to disable a deleting workspace and writes no audit", async () => {
    const admin = await superadmin();
    const { workspace } = await seedWorkspace({
      status: "deleting",
      deletedAt: Date.now() - DAY,
    });

    await expectError(
      await patchWorkspace(admin, workspace.id, {
        status: "disabled",
        disabledReason: "x",
      }),
      422,
      "INVALID_STATUS",
    );

    expect((await workspaceRow(workspace.id)).status).toBe("deleting");
    expect(await auditRows(workspace.id, "workspace.disable")).toHaveLength(0);
  });
});

describe("GET /api/admin/beta-invites", () => {
  it("lists the exact DTO without internal fields", async () => {
    const admin = await superadmin();
    const usedAt = Date.now() - DAY;
    const revokedAt = Date.now();
    const plain = await seedBetaInvite({ note: "Agencia Norte" });
    const used = await seedBetaInvite({ usedAt });
    const revoked = await seedBetaInvite({ revokedAt });

    const response = await call("/api/admin/beta-invites?limit=100", {
      as: admin,
    });

    expect(response.status).toBe(200);
    const page = betaInvitesPageSchema.parse(await response.json());
    for (const item of page.data) {
      expect(Object.keys(item).sort()).toEqual([
        "email",
        "id",
        "note",
        "revokedAt",
        "usedAt",
      ]);
    }
    const byId = Object.fromEntries(page.data.map((item) => [item.id, item]));
    expect(byId[plain.id]).toEqual({
      id: plain.id,
      email: plain.email,
      note: "Agencia Norte",
      usedAt: null,
      revokedAt: null,
    });
    expect(byId[used.id]!.usedAt).toBe(new Date(usedAt).toISOString());
    expect(byId[revoked.id]!.revokedAt).toBe(new Date(revokedAt).toISOString());
  });

  it("paginates by cursor without gaps or repeats", async () => {
    const admin = await superadmin();
    const created = (
      await Promise.all([seedBetaInvite(), seedBetaInvite(), seedBetaInvite()])
    ).map(({ id }) => id);

    const pages = await collectIds("/api/admin/beta-invites", admin, 2);

    const all = pages.flat();
    expect(pages[0]).toHaveLength(2);
    expect(pages.length).toBeGreaterThan(1);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual([...all].sort());
    expect(all).toEqual(expect.arrayContaining(created));
  });
});

describe("POST /api/admin/beta-invites", () => {
  it("creates the invite with a normalized email and sends the welcome email", async () => {
    server.use(resendSuccess());
    const emails = captureEmails();
    const admin = await superadmin();
    const email = uniqueEmail();

    const response = await call("/api/admin/beta-invites", {
      as: admin,
      method: "POST",
      body: { email: `  ${email.toUpperCase()} `, note: " Agencia Sur " },
    });

    expect(response.status).toBe(201);
    const { invite, emailSent } = betaInviteResponseSchema.parse(
      await response.json(),
    );
    expect(emailSent).toBe(true);
    expect(Object.keys(invite).sort()).toEqual([
      "email",
      "id",
      "note",
      "revokedAt",
      "usedAt",
    ]);
    expect(invite).toMatchObject({
      email,
      note: "Agencia Sur",
      usedAt: null,
      revokedAt: null,
    });
    expect(await betaInviteRow(invite.id)).toMatchObject({
      email,
      invitedBy: admin.id,
    });

    expect(emails).toHaveLength(1);
    const sent = await emails[0]!.json<{ to: string[]; text: string }>();
    expect(sent.to).toEqual([email]);
    expect(sent.text).toContain("/login");
  });

  it("makes the email eligible for a magic link", async () => {
    server.use(resendSuccess());
    const admin = await superadmin();
    const email = uniqueEmail();

    await call("/api/admin/beta-invites", {
      as: admin,
      method: "POST",
      body: { email },
    });

    expect((await findMagicLinkAccess(env.DB, email, Date.now())).invited).toBe(
      true,
    );
  });

  it("returns 409 ALREADY_INVITED for an existing email, any case", async () => {
    server.use(resendSuccess());
    const emails = captureEmails();
    const admin = await superadmin();
    const existing = await seedBetaInvite();

    await expectError(
      await call("/api/admin/beta-invites", {
        as: admin,
        method: "POST",
        body: { email: existing.email.toUpperCase() },
      }),
      409,
      "ALREADY_INVITED",
    );
    expect(emails).toHaveLength(0);
  });

  it("reinstates a revoked invite and sends the email again", async () => {
    server.use(resendSuccess());
    const emails = captureEmails();
    const admin = await superadmin();
    const revoked = await seedBetaInvite({ revokedAt: Date.now() });

    const response = await call("/api/admin/beta-invites", {
      as: admin,
      method: "POST",
      body: { email: revoked.email, note: "Segunda vez" },
    });

    expect(response.status).toBe(201);
    const { invite } = betaInviteResponseSchema.parse(await response.json());
    expect(invite).toMatchObject({
      id: revoked.id,
      note: "Segunda vez",
      revokedAt: null,
    });
    expect(await betaInviteRow(revoked.id)).toMatchObject({
      revokedAt: null,
      invitedBy: admin.id,
    });
    expect(emails).toHaveLength(1);
  });

  it("rejects invalid bodies with 400 and stores nothing", async () => {
    const admin = await superadmin();
    const email = uniqueEmail();

    for (const body of [
      {},
      { email: "not-an-email" },
      { email, note: "" },
      { email, note: "x".repeat(501) },
    ]) {
      await expectError(
        await call("/api/admin/beta-invites", {
          as: admin,
          method: "POST",
          body,
        }),
        400,
        "VALIDATION",
      );
    }
    expect(
      await db.select().from(betaInvites).where(eq(betaInvites.email, email)),
    ).toHaveLength(0);
  });

  it("keeps the invite active and reports emailSent false on email failure", async () => {
    server.use(resendServerError());
    const admin = await superadmin();
    const email = uniqueEmail();

    const response = await call("/api/admin/beta-invites", {
      as: admin,
      method: "POST",
      body: { email },
    });

    expect(response.status).toBe(201);
    const { invite, emailSent } = betaInviteResponseSchema.parse(
      await response.json(),
    );
    expect(emailSent).toBe(false);
    expect(invite.revokedAt).toBeNull();
    expect((await betaInviteRow(invite.id)).revokedAt).toBeNull();
    expect((await findMagicLinkAccess(env.DB, email, Date.now())).invited).toBe(
      true,
    );
  });
});

describe("DELETE /api/admin/beta-invites/:id", () => {
  it("revokes without deleting and removes magic link eligibility", async () => {
    const admin = await superadmin();
    const invite = await seedBetaInvite();
    expect(
      (await findMagicLinkAccess(env.DB, invite.email, Date.now())).invited,
    ).toBe(true);

    const response = await call(`/api/admin/beta-invites/${invite.id}`, {
      as: admin,
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect((await betaInviteRow(invite.id)).revokedAt).not.toBeNull();
    expect(
      (await findMagicLinkAccess(env.DB, invite.email, Date.now())).invited,
    ).toBe(false);
  });

  it("keeps the original revocation time when revoked twice", async () => {
    const admin = await superadmin();
    const revokedAt = Date.now() - DAY;
    const invite = await seedBetaInvite({ revokedAt });

    const response = await call(`/api/admin/beta-invites/${invite.id}`, {
      as: admin,
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    expect((await betaInviteRow(invite.id)).revokedAt).toBe(revokedAt);
  });

  it("returns 404 for an unknown invite", async () => {
    const admin = await superadmin();

    await expectError(
      await call(`/api/admin/beta-invites/${crypto.randomUUID()}`, {
        as: admin,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("POST /api/admin/meta-testers", () => {
  const APP_ID = "1234567890";
  const metaEnv = { META_APP_ID: APP_ID, META_APP_SECRET: "app_secret_test" };
  const rolesPath = `${APP_ID}/roles`;

  const addTester = (as: Caller["as"], body: unknown) =>
    call("/api/admin/meta-testers", { as, method: "POST", body, env: metaEnv });

  it("adds the Facebook user as an app tester with the app token", async () => {
    const requests: { url: string; authorization: string | null }[] = [];
    server.use(
      http.post(graphUrl(rolesPath), ({ request }) => {
        requests.push({
          url: request.url,
          authorization: request.headers.get("Authorization"),
        });
        return HttpResponse.json({ success: true });
      }),
    );
    const admin = await superadmin();

    const response = await addTester(admin, {
      facebookUserId: " 100012345678 ",
    });

    expect(response.status).toBe(204);
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("user")).toBe("100012345678");
    expect(url.searchParams.get("role")).toBe("testers");
    expect(requests[0]!.authorization).toBe(`Bearer ${APP_ID}|app_secret_test`);
  });

  it("returns 422 META_TESTER_REJECTED when Meta refuses the user", async () => {
    server.use(
      metaFails(rolesPath, {
        error: {
          message: "Invalid user id",
          code: 100,
          type: "OAuthException",
        },
      }),
    );
    const admin = await superadmin();

    await expectError(
      await addTester(admin, { facebookUserId: "100012345678" }),
      422,
      "META_TESTER_REJECTED",
    );
  });

  it.each([["username"], ["12ab"], ["123"], [""]])(
    "rejects the id %j without calling Meta",
    async (facebookUserId) => {
      const admin = await superadmin();

      await expectError(
        await addTester(admin, { facebookUserId }),
        400,
        "VALIDATION",
      );
    },
  );
});
