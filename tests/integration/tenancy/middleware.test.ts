import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import {
  requireRole,
  requireSuperadmin,
} from "../../../src/api/middleware/require-role";
import { session } from "../../../src/api/middleware/session";
import { workspace } from "../../../src/api/middleware/workspace";
import {
  auditStatement,
  writeAudit,
} from "../../../src/api/repositories/audit";
import {
  api,
  createUser,
  createWorkspace,
  expectError,
} from "../../helpers/factory";

const app = createApp();
app.get(
  "/w/:wid/probe-viewer",
  session({ required: true }),
  workspace(),
  requireRole("viewer"),
  (c) => c.json(c.get("scope")),
);
app.get(
  "/w/:wid/probe-editor",
  session({ required: true }),
  workspace(),
  requireRole("editor"),
  (c) => c.json(c.get("scope")),
);
app.get("/admin/probe", session({ required: true }), requireSuperadmin(), (c) =>
  c.json({ ok: true }),
);

const viewerPath = (wid: string) => `/api/w/${wid}/probe-viewer`;
const editorPath = (wid: string) => `/api/w/${wid}/probe-editor`;

describe("workspace middleware", () => {
  it("sets scope for a member", async () => {
    const viewer = await createUser();
    const { workspace } = await createWorkspace({
      members: [{ user: viewer, role: "viewer" }],
    });

    const response = await api(app, viewerPath(workspace.id), { as: viewer });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspaceId: workspace.id,
      userId: viewer.id,
      role: "viewer",
    });
  });

  it("answers 404 to a non-member", async () => {
    const stranger = await createUser();
    const { workspace } = await createWorkspace();

    await expectError(
      await api(app, viewerPath(workspace.id), { as: stranger }),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 404 to an unknown workspace", async () => {
    const user = await createUser();

    await expectError(
      await api(app, viewerPath(crypto.randomUUID()), { as: user }),
      404,
      "NOT_FOUND",
    );
  });

  it("gives superadmin no bypass", async () => {
    const admin = await createUser({ isSuperadmin: 1 });
    const { workspace } = await createWorkspace();

    await expectError(
      await api(app, viewerPath(workspace.id), { as: admin }),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 401 without a session", async () => {
    const { workspace } = await createWorkspace();

    await expectError(
      await api(app, viewerPath(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  describe("workspace status", () => {
    it("answers 403 to a member of a disabled workspace", async () => {
      const { workspace, owner } = await createWorkspace({
        status: "disabled",
      });

      await expectError(
        await api(app, viewerPath(workspace.id), { as: owner }),
        403,
        "WORKSPACE_DISABLED",
      );
    });

    it("answers 404 to a non-member of a disabled workspace", async () => {
      const stranger = await createUser();
      const { workspace } = await createWorkspace({ status: "disabled" });

      await expectError(
        await api(app, viewerPath(workspace.id), { as: stranger }),
        404,
        "NOT_FOUND",
      );
    });

    it("answers 404 to a member of a deleting workspace", async () => {
      const { workspace, owner } = await createWorkspace({
        status: "deleting",
      });

      await expectError(
        await api(app, viewerPath(workspace.id), { as: owner }),
        404,
        "NOT_FOUND",
      );
    });
  });
});

describe("requireRole", () => {
  it("answers 403 to a viewer on an editor route", async () => {
    const viewer = await createUser();
    const { workspace } = await createWorkspace({
      members: [{ user: viewer, role: "viewer" }],
    });

    await expectError(
      await api(app, editorPath(workspace.id), { as: viewer }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it.each(["editor", "admin", "owner"] as const)(
    "lets %s through an editor route",
    async (role) => {
      const member = await createUser();
      const { workspace, owner } = await createWorkspace({
        members: role === "owner" ? [] : [{ user: member, role }],
      });

      const response = await api(app, editorPath(workspace.id), {
        as: role === "owner" ? owner : member,
      });

      expect(response.status).toBe(200);
      expect(((await response.json()) as { role: string }).role).toBe(role);
    },
  );
});

describe("requireSuperadmin", () => {
  it("answers 404 to a normal user", async () => {
    const user = await createUser();

    await expectError(
      await api(app, "/api/admin/probe", { as: user }),
      404,
      "NOT_FOUND",
    );
  });

  it("lets a superadmin through", async () => {
    const admin = await createUser({ isSuperadmin: 1 });

    expect((await api(app, "/api/admin/probe", { as: admin })).status).toBe(
      200,
    );
  });
});

describe("audit", () => {
  const entry = (action: string) => ({
    workspaceId: null,
    actorUserId: null,
    actorType: "system" as const,
    origin: "system" as const,
    action,
  });

  const rowsFor = (action: string) =>
    env.DB.prepare("SELECT * FROM audit_log WHERE action = ?")
      .bind(action)
      .all<{ result: string; detail: string | null }>();

  it("writes a row with JSON detail and default result", async () => {
    const action = `test.${crypto.randomUUID()}`;

    await writeAudit(env.DB, { ...entry(action), detail: { count: 2 } });

    const { results } = await rowsFor(action);
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe("ok");
    expect(JSON.parse(results[0]!.detail!)).toEqual({ count: 2 });
  });

  it("runs inside a batch with another statement", async () => {
    const action = `test.${crypto.randomUUID()}`;
    const other = `test.${crypto.randomUUID()}`;
    const db = drizzle(env.DB);

    await db.batch([
      auditStatement(env.DB, entry(action)),
      auditStatement(env.DB, entry(other)),
    ]);

    expect((await rowsFor(action)).results).toHaveLength(1);
    expect((await rowsFor(other)).results).toHaveLength(1);
  });
});
