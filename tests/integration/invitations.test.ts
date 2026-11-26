import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import type { Env } from "../../src/api/env";
import { sha256Hex } from "../../src/api/lib/hash";
import { DAY_MS } from "../../src/api/lib/time";
import { insertInvitation } from "../../src/api/repositories/invitations";
import { plans, users } from "../../src/db/schema/auth";
import { auditLog } from "../../src/db/schema/ops";
import {
  invitations,
  memberships,
  workspaces,
} from "../../src/db/schema/workspaces";
import type { Role } from "../../src/shared/constants";
import {
  acceptInvitationResponseSchema,
  invitationResponseSchema,
  invitationsPageSchema,
} from "../../src/shared/schemas/invitations";
import {
  api,
  createInvitation,
  createUser,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import {
  resendBadRequest,
  resendServerError,
  resendSuccess,
} from "../helpers/msw/resend";
import { server } from "../helpers/msw/server";
import { seedTenantPair, seedWorkspaceWithRoles } from "../helpers/tenant-pair";
import {
  blockedLimiter,
  openLimiter,
  testEnv,
  trustedHeaders,
} from "./pipeline/helpers";

const SESSION_COOKIE = "__Host-lanzador_sid";
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

const invitationsPath = (workspaceId: string, id?: string) =>
  `/api/w/${workspaceId}/invitations${id ? `/${id}` : ""}`;

const invite = (workspaceId: string, as: Caller["as"], body: unknown) =>
  call(invitationsPath(workspaceId), { as, method: "POST", body });

const accept = (token: unknown, options: Caller = {}) =>
  call("/api/invitations/accept", {
    ...options,
    method: "POST",
    body: { token },
  });

const uniqueEmail = () => `${crypto.randomUUID()}@example.test`;

const captureEmails = () => {
  const requests: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
};

const tokenIn = (text: string) => text.match(/#t=([A-Za-z0-9_-]+)/)?.[1];

const invitationRows = (workspaceId: string) =>
  db.select().from(invitations).where(eq(invitations.workspaceId, workspaceId));

const invitationById = (id: string) =>
  db
    .select()
    .from(invitations)
    .where(eq(invitations.id, id))
    .then(([row]) => row!);

const auditRows = (workspaceId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.action, action)),
    );

const memberRows = (workspaceId: string) =>
  db.select().from(memberships).where(eq(memberships.workspaceId, workspaceId));

const roleOf = (workspaceId: string, userId: string) =>
  memberRows(workspaceId).then(
    (rows) => rows.find((row) => row.userId === userId)?.role,
  );

async function limitMembers(workspaceId: string, maxMembers: number) {
  const planId = `plan-${crypto.randomUUID()}`;
  await db
    .insert(plans)
    .values({ id: planId, name: planId, maxMembers, createdAt: Date.now() });
  await db
    .update(workspaces)
    .set({ planId, trialEndsAt: Date.now() + DAY_MS })
    .where(eq(workspaces.id, workspaceId));
}

const cookieToken = (response: Response) =>
  response.headers
    .get("Set-Cookie")
    ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];

const meWithCookie = (token: string) =>
  app.request(
    "/api/me",
    { headers: { ...trustedHeaders, Cookie: `${SESSION_COOKIE}=${token}` } },
    testEnv(baseEnv),
  );

afterEach(() => {
  server.events.removeAllListeners();
});

describe("GET /api/w/:wid/invitations", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await call(invitationsPath(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 403 to an editor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(invitationsPath(workspace.id), { as: users.editor }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("lists the DTO shape with derived status and no token data", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const at = Date.now();
    const pending = await createInvitation(workspace.id);
    const accepted = await createInvitation(workspace.id, { acceptedAt: at });
    const revoked = await createInvitation(workspace.id, { revokedAt: at });
    const expired = await createInvitation(workspace.id, {
      expiresAt: at - DAY,
    });

    const response = await call(invitationsPath(workspace.id), {
      as: users.admin,
    });

    expect(response.status).toBe(200);
    const page = invitationsPageSchema.parse(await response.json());
    expect(page.nextCursor).toBeNull();
    for (const item of page.data) {
      expect(Object.keys(item).sort()).toEqual([
        "email",
        "expiresAt",
        "id",
        "role",
        "status",
      ]);
    }
    const statusById = Object.fromEntries(
      page.data.map((item) => [item.id, item.status]),
    );
    expect(statusById).toEqual({
      [pending.invitation.id]: "pending",
      [accepted.invitation.id]: "accepted",
      [revoked.invitation.id]: "revoked",
      [expired.invitation.id]: "expired",
    });
    expect(JSON.stringify(page)).not.toContain(pending.invitation.tokenHash);
  });

  it("paginates with a cursor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      created.push((await createInvitation(workspace.id)).invitation.id);
    }
    created.sort();

    const first = invitationsPageSchema.parse(
      await (
        await call(`${invitationsPath(workspace.id)}?limit=2`, {
          as: users.admin,
        })
      ).json(),
    );
    const second = invitationsPageSchema.parse(
      await (
        await call(
          `${invitationsPath(workspace.id)}?limit=2&cursor=${first.nextCursor}`,
          { as: users.admin },
        )
      ).json(),
    );

    expect(first.data.map((item) => item.id)).toEqual(created.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    expect(second.data.map((item) => item.id)).toEqual(created.slice(2));
    expect(second.nextCursor).toBeNull();
  });

  it("does not list invitations of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    const page = invitationsPageSchema.parse(
      await (
        await call(invitationsPath(A.workspace.id), { as: A.users.admin })
      ).json(),
    );

    expect(page.data.map((item) => item.id)).toEqual([A.invitation.id]);
    expect(page.data.map((item) => item.id)).not.toContain(B.invitation.id);
  });
});

describe("POST /api/w/:wid/invitations", () => {
  it("returns 401 without a session and 403 to an editor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const body = { email: uniqueEmail(), role: "viewer" };

    await expectError(
      await invite(workspace.id, undefined, body),
      401,
      "UNAUTHENTICATED",
    );
    await expectError(
      await invite(workspace.id, users.editor, body),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("creates the invitation, sends the email and audits it", async () => {
    server.use(resendSuccess());
    const emails = captureEmails();
    const { workspace, users } = await seedWorkspaceWithRoles();
    const email = uniqueEmail();

    const response = await invite(workspace.id, users.admin, {
      email: `  ${email.toUpperCase()} `,
      role: "editor",
    });

    expect(response.status).toBe(201);
    const { invitation } = invitationResponseSchema.parse(
      await response.json(),
    );
    expect(Object.keys(invitation).sort()).toEqual([
      "email",
      "expiresAt",
      "id",
      "role",
      "status",
    ]);
    expect(invitation).toMatchObject({
      email,
      role: "editor",
      status: "pending",
    });

    expect(emails).toHaveLength(1);
    const sent = await emails[0]!.json<{ to: string[]; text: string }>();
    expect(sent.to).toEqual([email]);
    const token = tokenIn(sent.text)!;
    expect(sent.text).toContain("/invitacion#t=");

    const row = await invitationById(invitation.id);
    expect(row.email).toBe(email);
    expect(row.tokenHash).toBe(await sha256Hex(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.invitedBy).toBe(users.admin.id);
    expect(row.workspaceId).toBe(workspace.id);
    expect(row.expiresAt - row.createdAt).toBe(7 * DAY);

    const [audit] = await auditRows(workspace.id, "member.invite");
    expect(audit).toMatchObject({
      actorUserId: users.admin.id,
      objectName: email,
    });
    expect(audit!.detail).not.toContain(token);
  });

  it("rejects the owner role and invalid emails with 400", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await invite(workspace.id, users.admin, {
        email: uniqueEmail(),
        role: "owner",
      }),
      400,
      "VALIDATION",
    );
    await expectError(
      await invite(workspace.id, users.admin, {
        email: "not-an-email",
        role: "viewer",
      }),
      400,
      "VALIDATION",
    );
    expect(await invitationRows(workspace.id)).toHaveLength(0);
  });

  it("returns 409 ALREADY_MEMBER for a current member, ignoring case", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await invite(workspace.id, users.admin, {
        email: users.viewer.email.toUpperCase(),
        role: "viewer",
      }),
      409,
      "ALREADY_MEMBER",
    );
  });

  it("returns 409 INVITATION_PENDING for an open invitation", async () => {
    server.use(resendSuccess());
    const { workspace, users } = await seedWorkspaceWithRoles();
    const { invitation } = await createInvitation(workspace.id);

    await expectError(
      await invite(workspace.id, users.admin, {
        email: invitation.email,
        role: "viewer",
      }),
      409,
      "INVITATION_PENDING",
    );
  });

  it("reports a concurrent duplicate insert as a conflict", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const scope = {
      workspaceId: workspace.id,
      userId: users.admin.id,
      role: "admin" as Role,
    };
    const email = uniqueEmail();
    const row = (tokenHash: string) => ({
      id: crypto.randomUUID(),
      email,
      role: "viewer" as const,
      tokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + DAY,
    });

    expect(await insertInvitation(env.DB, scope, row("hash-1"))).toMatchObject({
      status: "created",
    });
    expect(await insertInvitation(env.DB, scope, row("hash-2"))).toEqual({
      status: "duplicate",
    });
  });

  it("refuses an insert that would pass the plan member limit", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await limitMembers(workspace.id, 4);
    const scope = {
      workspaceId: workspace.id,
      userId: users.admin.id,
      role: "admin" as Role,
    };

    const result = await insertInvitation(env.DB, scope, {
      id: crypto.randomUUID(),
      email: uniqueEmail(),
      role: "viewer",
      tokenHash: "hash-full",
      createdAt: Date.now(),
      expiresAt: Date.now() + DAY,
    });

    expect(result).toEqual({ status: "full" });
  });

  it("allows a new invitation after an expired or revoked one", async () => {
    server.use(resendSuccess());
    const { workspace, users } = await seedWorkspaceWithRoles();
    const expired = await createInvitation(workspace.id, {
      expiresAt: Date.now() - DAY,
    });
    const revoked = await createInvitation(workspace.id, {
      revokedAt: Date.now(),
    });

    for (const { invitation } of [expired, revoked]) {
      const response = await invite(workspace.id, users.admin, {
        email: invitation.email,
        role: "viewer",
      });
      expect(response.status).toBe(201);
    }
    expect(await invitationRows(workspace.id)).toHaveLength(4);
  });

  it("counts members and pending invitations against the plan", async () => {
    server.use(resendSuccess());
    const { workspace, users } = await seedWorkspaceWithRoles();
    await limitMembers(workspace.id, 6);
    await createInvitation(workspace.id);
    await createInvitation(workspace.id, { expiresAt: Date.now() - DAY });
    await createInvitation(workspace.id, { revokedAt: Date.now() });

    const withRoom = await invite(workspace.id, users.admin, {
      email: uniqueEmail(),
      role: "viewer",
    });
    const full = await invite(workspace.id, users.admin, {
      email: uniqueEmail(),
      role: "viewer",
    });

    expect(withRoom.status).toBe(201);
    await expectError(full, 422, "PLAN_MEMBER_LIMIT");
  });

  it("revokes the invitation on email failure so it can be retried", async () => {
    server.use(resendServerError());
    const { workspace, users } = await seedWorkspaceWithRoles();
    const email = uniqueEmail();
    const body = { email, role: "viewer" };

    await expectError(
      await invite(workspace.id, users.admin, body),
      503,
      "EMAIL_SEND_FAILED",
    );

    const [row] = await invitationRows(workspace.id);
    expect(row!.revokedAt).not.toBeNull();
    expect(await auditRows(workspace.id, "member.invite")).toHaveLength(0);

    server.resetHandlers(resendSuccess());
    const retry = await invite(workspace.id, users.admin, body);
    expect(retry.status).toBe(201);
    expect(await invitationRows(workspace.id)).toHaveLength(2);
  });

  it("does not retry a non-retryable provider rejection", async () => {
    server.use(resendBadRequest());
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await invite(workspace.id, users.admin, {
        email: uniqueEmail(),
        role: "viewer",
      }),
      503,
      "EMAIL_SEND_FAILED",
    );
  });
});

describe("DELETE /api/w/:wid/invitations/:id", () => {
  it("returns 401 without a session and 403 to an editor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const { invitation } = await createInvitation(workspace.id);
    const path = invitationsPath(workspace.id, invitation.id);

    await expectError(
      await call(path, { method: "DELETE" }),
      401,
      "UNAUTHENTICATED",
    );
    await expectError(
      await call(path, { as: users.editor, method: "DELETE" }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("revokes with 204 and the token stops working", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const { invitation, token } = await createInvitation(workspace.id);
    const path = invitationsPath(workspace.id, invitation.id);

    const response = await call(path, { as: users.admin, method: "DELETE" });
    const again = await call(path, { as: users.admin, method: "DELETE" });

    expect(response.status).toBe(204);
    expect(again.status).toBe(204);
    expect((await invitationById(invitation.id)).revokedAt).not.toBeNull();
    await expectError(await accept(token), 410, "INVITATION_EXPIRED");
  });

  it("returns 404 for an unknown or accepted invitation", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const { invitation } = await createInvitation(workspace.id, {
      acceptedAt: Date.now(),
    });

    await expectError(
      await call(invitationsPath(workspace.id, invitation.id), {
        as: users.admin,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await call(invitationsPath(workspace.id, crypto.randomUUID()), {
        as: users.admin,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an invitation of another workspace and keeps it open", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(invitationsPath(A.workspace.id, B.invitation.id), {
        as: A.users.admin,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await call(invitationsPath(B.workspace.id, B.invitation.id), {
        as: A.users.admin,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
    expect((await invitationById(B.invitation.id)).revokedAt).toBeNull();
  });
});

describe("POST /api/invitations/accept", () => {
  it("rejects a missing token with 400", async () => {
    await expectError(await accept(undefined), 400, "VALIDATION");
  });

  it("is rate limited", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const { token } = await createInvitation(workspace.id);

    await expectError(
      await accept(token, { env: { RL_AUTH: blockedLimiter } }),
      429,
      "RATE_LIMITED",
    );
  });

  it("creates the user, the membership and a session without one", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const email = uniqueEmail();
    const { invitation, token } = await createInvitation(workspace.id, {
      email,
      role: "admin",
    });

    const response = await accept(token);

    expect(response.status).toBe(200);
    expect(acceptInvitationResponseSchema.parse(await response.json())).toEqual(
      { workspaceId: workspace.id, role: "admin" },
    );
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user).toBeDefined();
    expect(await roleOf(workspace.id, user!.id)).toBe("admin");
    const row = await invitationById(invitation.id);
    expect(row.acceptedBy).toBe(user!.id);
    expect(row.acceptedAt).not.toBeNull();
    const [audit] = await auditRows(workspace.id, "member.join");
    expect(audit).toMatchObject({
      actorUserId: user!.id,
      actorType: "user",
      objectName: email,
    });
    expect(audit!.detail).not.toContain(token);

    const sessionToken = cookieToken(response);
    expect(sessionToken).toBeDefined();
    const me = await meWithCookie(sessionToken!);
    expect(me.status).toBe(200);
    expect((await me.json<{ user: { email: string } }>()).user.email).toBe(
      email,
    );
  });

  it("adds an existing user without a session and logs them in", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const existing = await createUser();
    const { token } = await createInvitation(workspace.id, {
      email: existing.email,
      role: "viewer",
    });

    const response = await accept(token);

    expect(response.status).toBe(200);
    expect(cookieToken(response)).toBeDefined();
    expect(await roleOf(workspace.id, existing.id)).toBe("viewer");
    const sameEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, existing.email));
    expect(sameEmail).toHaveLength(1);
  });

  it("accepts with a matching session and sets no cookie", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const invitee = await createUser();
    const { token } = await createInvitation(workspace.id, {
      email: invitee.email,
      role: "editor",
    });

    const response = await accept(token, { as: invitee });

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.json()).toEqual({
      workspaceId: workspace.id,
      role: "editor",
    });
    expect(await roleOf(workspace.id, invitee.id)).toBe("editor");
  });

  it("returns 409 EMAIL_MISMATCH without consuming the token", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const stranger = await createUser();
    const email = uniqueEmail();
    const { invitation, token } = await createInvitation(workspace.id, {
      email,
    });

    await expectError(
      await accept(token, { as: stranger }),
      409,
      "EMAIL_MISMATCH",
    );

    const row = await invitationById(invitation.id);
    expect(row.acceptedAt).toBeNull();
    expect(await roleOf(workspace.id, stranger.id)).toBeUndefined();
    const retry = await accept(token);
    expect(retry.status).toBe(200);
  });

  it("returns 410 for unknown, expired, revoked and reused tokens", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const expired = await createInvitation(workspace.id, {
      expiresAt: Date.now() - 1,
    });
    const revoked = await createInvitation(workspace.id, {
      revokedAt: Date.now(),
    });
    const used = await createInvitation(workspace.id);
    expect((await accept(used.token)).status).toBe(200);

    for (const token of [
      "unknown-token",
      expired.token,
      revoked.token,
      used.token,
    ]) {
      await expectError(await accept(token), 410, "INVITATION_EXPIRED");
    }
  });

  it("returns 410 instead of 409 when the invitation is not usable", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const stranger = await createUser();
    const { token } = await createInvitation(workspace.id, {
      expiresAt: Date.now() - 1,
    });

    await expectError(
      await accept(token, { as: stranger }),
      410,
      "INVITATION_EXPIRED",
    );
  });

  it("returns 410 when the invited user is disabled", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const disabled = await createUser({ status: "disabled" });
    const { invitation, token } = await createInvitation(workspace.id, {
      email: disabled.email,
    });

    const response = await accept(token);

    await expectError(response, 410, "INVITATION_EXPIRED");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect((await invitationById(invitation.id)).acceptedAt).toBeNull();
    expect(await roleOf(workspace.id, disabled.id)).toBeUndefined();
  });

  it("returns 410 when the workspace is deleting or disabled", async () => {
    for (const status of ["deleting", "disabled"] as const) {
      const { workspace } = await createWorkspace({ status });
      const { invitation, token } = await createInvitation(workspace.id);

      await expectError(await accept(token), 410, "INVITATION_EXPIRED");
      expect((await invitationById(invitation.id)).acceptedAt).toBeNull();
    }
  });

  it("is idempotent for an existing member and keeps their role", async () => {
    const { workspace, users: roles } = await seedWorkspaceWithRoles();
    const { invitation, token } = await createInvitation(workspace.id, {
      email: roles.admin.email,
      role: "viewer",
    });
    const before = await memberRows(workspace.id);

    const response = await accept(token, { as: roles.admin });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspaceId: workspace.id,
      role: "admin",
    });
    expect(await memberRows(workspace.id)).toHaveLength(before.length);
    expect(await roleOf(workspace.id, roles.admin.id)).toBe("admin");
    expect((await invitationById(invitation.id)).acceptedAt).not.toBeNull();
  });

  it("lets only one of two concurrent accepts win", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const { token } = await createInvitation(workspace.id);

    const statuses = (await Promise.all([accept(token), accept(token)])).map(
      (response) => response.status,
    );

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 410)).toHaveLength(1);
  });
});
