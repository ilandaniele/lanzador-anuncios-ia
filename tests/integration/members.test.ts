import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { auditLog } from "../../src/db/schema/ops";
import { memberships, workspaces } from "../../src/db/schema/workspaces";
import { PAGINATION } from "../../src/shared/constants";
import {
  memberResponseSchema,
  membersPageSchema,
  transferOwnershipResponseSchema,
} from "../../src/shared/schemas/members";
import {
  api,
  createUser,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { seedTenantPair, seedWorkspaceWithRoles } from "../helpers/tenant-pair";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller) =>
  api(app, path, { env: openLimits, ...options });

const membersPath = (workspaceId: string, userId?: string) =>
  `/api/w/${workspaceId}/members${userId ? `/${userId}` : ""}`;

const transferPath = (workspaceId: string) =>
  `/api/w/${workspaceId}/transfer-ownership`;

const auditRows = (workspaceId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.action, action)),
    );

const roleOf = (workspaceId: string, userId: string) =>
  db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
      ),
    )
    .then(([row]) => row?.role);

const ownerRows = (workspaceId: string) =>
  db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "owner"),
      ),
    );

const patchRole = (
  workspaceId: string,
  userId: string,
  as: Caller["as"],
  role: unknown,
) =>
  call(membersPath(workspaceId, userId), {
    as,
    method: "PATCH",
    body: { role },
  });

const remove = (workspaceId: string, userId: string, as: Caller["as"]) =>
  call(membersPath(workspaceId, userId), { as, method: "DELETE" });

const transfer = (workspaceId: string, as: Caller["as"], body: unknown) =>
  call(transferPath(workspaceId), { as, method: "POST", body });

describe("GET /api/w/:wid/members", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await call(membersPath(workspace.id), {}),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("lists members with the DTO shape and no internal fields", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(membersPath(workspace.id), {
      as: users.viewer,
    });

    expect(response.status).toBe(200);
    const page = membersPageSchema.parse(await response.json());
    expect(page.nextCursor).toBeNull();
    expect(page.data).toHaveLength(4);
    for (const item of page.data) {
      expect(Object.keys(item).sort()).toEqual([
        "email",
        "joinedAt",
        "name",
        "role",
        "userId",
      ]);
    }
    const byUser = Object.fromEntries(page.data.map((m) => [m.userId, m]));
    expect(byUser[users.owner.id]).toMatchObject({
      email: users.owner.email,
      role: "owner",
    });
    expect(byUser[users.viewer.id]?.role).toBe("viewer");
  });

  it("walks every member once through the cursor", async () => {
    const extra = await Promise.all(
      Array.from({ length: 5 }, async () => ({
        user: await createUser(),
        role: "viewer" as const,
      })),
    );
    const { workspace, owner } = await createWorkspace({ members: extra });
    const expected = [owner, ...extra.map(({ user }) => user)].map(
      (user) => user.id,
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : "";
      const response = await call(
        `${membersPath(workspace.id)}?limit=2${query}`,
        {
          as: owner,
        },
      );
      const page = membersPageSchema.parse(await response.json());
      expect(page.data.length).toBeLessThanOrEqual(2);
      seen.push(...page.data.map((m) => m.userId));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect([...seen].sort()).toEqual([...expected].sort());
  });

  it("returns a cursor-less last page when the limit fits everything", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(`${membersPath(workspace.id)}?limit=4`, {
      as: users.owner,
    });

    expect(
      membersPageSchema.parse(await response.json()).nextCursor,
    ).toBeNull();
  });

  it.each([
    ["limit above the max", `limit=${PAGINATION.maxLimit + 1}`],
    ["limit zero", "limit=0"],
    ["limit not a number", "limit=abc"],
    ["tampered cursor", "cursor=***"],
  ])("returns 400 VALIDATION for %s", async (_label, query) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(`${membersPath(workspace.id)}?${query}`, {
      as: users.owner,
    });

    await expectError(response, 400, "VALIDATION");
  });

  it("accepts the max page size", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(
      `${membersPath(workspace.id)}?limit=${PAGINATION.maxLimit}`,
      { as: users.owner },
    );

    expect(response.status).toBe(200);
  });

  it("returns 404 to a user of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(membersPath(A.workspace.id), { as: B.users.owner }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("PATCH /api/w/:wid/members/:userId", () => {
  it("changes the role, returns the member and audits it", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await patchRole(
      workspace.id,
      users.viewer.id,
      users.admin,
      "editor",
    );

    expect(response.status).toBe(200);
    const { member } = memberResponseSchema.parse(await response.json());
    expect(member).toMatchObject({
      userId: users.viewer.id,
      email: users.viewer.email,
      role: "editor",
    });
    expect(await roleOf(workspace.id, users.viewer.id)).toBe("editor");
    const [entry, ...rest] = await auditRows(
      workspace.id,
      "member.role.update",
    );
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorUserId: users.admin.id,
      objectType: "member",
      objectName: users.viewer.email,
      origin: "manual",
      result: "ok",
    });
    expect(JSON.parse(entry!.detail!)).toEqual({
      userId: users.viewer.id,
      from: "viewer",
      to: "editor",
    });
  });

  it("lets an admin change another admin", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const otherAdmin = await createUser();
    await db.insert(memberships).values({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      userId: otherAdmin.id,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const response = await patchRole(
      workspace.id,
      otherAdmin.id,
      users.admin,
      "viewer",
    );

    expect(response.status).toBe(200);
    expect(await roleOf(workspace.id, otherAdmin.id)).toBe("viewer");
  });

  it("returns 422 CANNOT_CHANGE_OWNER when the target is the owner", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await patchRole(
      workspace.id,
      users.owner.id,
      users.admin,
      "viewer",
    );

    await expectError(response, 422, "CANNOT_CHANGE_OWNER");
    expect(await roleOf(workspace.id, users.owner.id)).toBe("owner");
    expect(await auditRows(workspace.id, "member.role.update")).toEqual([]);
  });

  it.each(["owner", "superadmin", "", 1, undefined])(
    "returns 400 VALIDATION and never promotes with role %j",
    async (role) => {
      const { workspace, users } = await seedWorkspaceWithRoles();

      const response = await patchRole(
        workspace.id,
        users.viewer.id,
        users.admin,
        role,
      );

      await expectError(response, 400, "VALIDATION");
      expect(await roleOf(workspace.id, users.viewer.id)).toBe("viewer");
    },
  );

  it("returns 403 FORBIDDEN_ROLE for an editor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await patchRole(
      workspace.id,
      users.viewer.id,
      users.editor,
      "admin",
    );

    await expectError(response, 403, "FORBIDDEN_ROLE");
    expect(await roleOf(workspace.id, users.viewer.id)).toBe("viewer");
  });

  it("returns 404 for a user that is not a member", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const stranger = await createUser();

    const response = await patchRole(
      workspace.id,
      stranger.id,
      users.admin,
      "editor",
    );

    await expectError(response, 404, "NOT_FOUND");
  });

  it("returns 404 and changes nothing for a member of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    const response = await patchRole(
      A.workspace.id,
      B.users.viewer.id,
      A.users.owner,
      "admin",
    );

    await expectError(response, 404, "NOT_FOUND");
    expect(await roleOf(B.workspace.id, B.users.viewer.id)).toBe("viewer");
  });
});

describe("DELETE /api/w/:wid/members/:userId", () => {
  it("lets a viewer leave and audits it", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await remove(workspace.id, users.viewer.id, users.viewer);

    expect(response.status).toBe(204);
    expect(await roleOf(workspace.id, users.viewer.id)).toBeUndefined();
    const [entry, ...rest] = await auditRows(workspace.id, "member.remove");
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorUserId: users.viewer.id,
      objectType: "member",
      objectName: users.viewer.email,
    });
    expect(JSON.parse(entry!.detail!)).toEqual({
      userId: users.viewer.id,
      role: "viewer",
    });
  });

  it("returns 403 FORBIDDEN_ROLE when a viewer removes someone else", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await remove(workspace.id, users.editor.id, users.viewer);

    await expectError(response, 403, "FORBIDDEN_ROLE");
    expect(await roleOf(workspace.id, users.editor.id)).toBe("editor");
  });

  it("lets an admin remove an editor, who then loses access", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await remove(workspace.id, users.editor.id, users.admin);

    expect(response.status).toBe(204);
    await expectError(
      await call(`/api/w/${workspace.id}`, { as: users.editor }),
      404,
      "NOT_FOUND",
    );
    expect(await auditRows(workspace.id, "member.remove")).toHaveLength(1);
  });

  it("returns 422 OWNER_CANNOT_LEAVE when the owner leaves", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await remove(workspace.id, users.owner.id, users.owner);

    await expectError(response, 422, "OWNER_CANNOT_LEAVE");
    expect(await roleOf(workspace.id, users.owner.id)).toBe("owner");
  });

  it("returns 422 OWNER_CANNOT_LEAVE when an admin removes the owner", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await remove(workspace.id, users.owner.id, users.admin);

    await expectError(response, 422, "OWNER_CANNOT_LEAVE");
    expect(await auditRows(workspace.id, "member.remove")).toEqual([]);
  });

  it("returns 404 for a user that is not a member", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const stranger = await createUser();

    await expectError(
      await remove(workspace.id, stranger.id, users.admin),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 and removes nothing for a member of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    const response = await remove(
      A.workspace.id,
      B.users.viewer.id,
      A.users.owner,
    );

    await expectError(response, 404, "NOT_FOUND");
    expect(await roleOf(B.workspace.id, B.users.viewer.id)).toBe("viewer");
  });
});

describe("POST /api/w/:wid/transfer-ownership", () => {
  it("returns 422 WORKSPACE_LIMIT when the successor already owns three workspaces", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    for (let index = 0; index < 3; index += 1) {
      await createWorkspace({ owner: users.editor });
    }

    const response = await transfer(workspace.id, users.owner, {
      userId: users.editor.id,
      confirm: true,
    });

    await expectError(response, 422, "WORKSPACE_LIMIT");
    expect(await roleOf(workspace.id, users.owner.id)).toBe("owner");
    expect(await roleOf(workspace.id, users.editor.id)).toBe("editor");
  });

  it("moves ownership, demotes the old owner and audits both changes", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await transfer(workspace.id, users.owner, {
      userId: users.editor.id,
      confirm: true,
    });

    expect(response.status).toBe(200);
    const body = transferOwnershipResponseSchema.parse(await response.json());
    expect(body.workspace.id).toBe(workspace.id);
    expect(await ownerRows(workspace.id)).toEqual([
      { userId: users.editor.id },
    ]);
    expect(await roleOf(workspace.id, users.owner.id)).toBe("admin");
    const [row] = await db
      .select({ ownerUserId: workspaces.ownerUserId })
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id));
    expect(row?.ownerUserId).toBe(users.editor.id);
    const entries = await auditRows(workspace.id, "member.role.update");
    expect(
      entries.map(({ actorUserId, detail }) => ({
        actorUserId,
        detail: JSON.parse(detail!),
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          actorUserId: users.owner.id,
          detail: { userId: users.owner.id, from: "owner", to: "admin" },
        },
        {
          actorUserId: users.owner.id,
          detail: { userId: users.editor.id, from: "editor", to: "owner" },
        },
      ]),
    );
    expect(entries).toHaveLength(2);
  });

  it("lets the new owner act as owner and the old one lose owner rights", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await transfer(workspace.id, users.owner, {
      userId: users.admin.id,
      confirm: true,
    });

    const asOldOwner = await transfer(workspace.id, users.owner, {
      userId: users.viewer.id,
      confirm: true,
    });
    const asNewOwner = await transfer(workspace.id, users.admin, {
      userId: users.owner.id,
      confirm: true,
    });

    await expectError(asOldOwner, 403, "FORBIDDEN_ROLE");
    expect(asNewOwner.status).toBe(200);
    expect(await ownerRows(workspace.id)).toEqual([{ userId: users.owner.id }]);
  });

  it("returns 422 NOT_A_MEMBER for a user outside the workspace", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const stranger = await createUser();

    const response = await transfer(workspace.id, users.owner, {
      userId: stranger.id,
      confirm: true,
    });

    await expectError(response, 422, "NOT_A_MEMBER");
    expect(await ownerRows(workspace.id)).toEqual([{ userId: users.owner.id }]);
  });

  it("returns 422 NOT_A_MEMBER for a member of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    const response = await transfer(A.workspace.id, A.users.owner, {
      userId: B.users.owner.id,
      confirm: true,
    });

    await expectError(response, 422, "NOT_A_MEMBER");
    expect(await ownerRows(B.workspace.id)).toEqual([
      { userId: B.users.owner.id },
    ]);
  });

  it("returns 400 VALIDATION when the owner targets themself", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await transfer(workspace.id, users.owner, {
      userId: users.owner.id,
      confirm: true,
    });

    await expectError(response, 400, "VALIDATION");
    expect(await roleOf(workspace.id, users.owner.id)).toBe("owner");
  });

  it.each([
    ["missing confirm", { userId: "x" }],
    ["confirm false", { userId: "x", confirm: false }],
    ["confirm as string", { userId: "x", confirm: "true" }],
    ["missing userId", { confirm: true }],
    ["empty userId", { userId: "", confirm: true }],
  ])("returns 400 VALIDATION for %s", async (_label, body) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await transfer(workspace.id, users.owner, body),
      400,
      "VALIDATION",
    );
    expect(await ownerRows(workspace.id)).toEqual([{ userId: users.owner.id }]);
  });

  it("returns 403 FORBIDDEN_ROLE for an admin", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await transfer(workspace.id, users.admin, {
      userId: users.admin.id,
      confirm: true,
    });

    await expectError(response, 403, "FORBIDDEN_ROLE");
  });

  it("returns 404 to a user of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    const response = await transfer(A.workspace.id, B.users.owner, {
      userId: B.users.admin.id,
      confirm: true,
    });

    await expectError(response, 404, "NOT_FOUND");
  });

  it("returns 401 without a session", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await transfer(workspace.id, undefined, {
      userId: users.admin.id,
      confirm: true,
    });

    await expectError(response, 401, "UNAUTHENTICATED");
  });
});

describe("members 401", () => {
  it.each([
    ["PATCH", { role: "viewer" }],
    ["DELETE", undefined],
  ])("returns 401 on %s without a session", async (method, body) => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(membersPath(workspace.id, users.viewer.id), {
      method,
      body,
    });

    await expectError(response, 401, "UNAUTHENTICATED");
  });
});
