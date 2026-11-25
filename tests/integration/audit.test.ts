import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import { auditLog } from "../../src/db/schema/ops";
import { auditPageSchema } from "../../src/shared/schemas/audit";
import { api, expectError } from "../helpers/factory";
import { seedTenantPair, seedWorkspaceWithRoles } from "../helpers/tenant-pair";
import { openLimiter } from "./pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const read = (workspaceId: string, as: Caller["as"], query = "") =>
  api(app, `/api/w/${workspaceId}/audit${query}`, { env: openLimits, as });

const readPage = async (workspaceId: string, as: Caller["as"], query = "") =>
  auditPageSchema.parse(await (await read(workspaceId, as, query)).json());

const idsOf = (page: Awaited<ReturnType<typeof readPage>>) =>
  page.data.map((entry) => entry.id);

let sequence = 0;

const insertAudit = async (
  workspaceId: string,
  overrides: Partial<typeof auditLog.$inferInsert> = {},
) => {
  sequence += 1;
  const row = {
    id: crypto.randomUUID(),
    workspaceId,
    actorUserId: null,
    actorType: "user",
    origin: "manual",
    action: "settings.update",
    result: "ok",
    createdAt: Date.now() + sequence,
    ...overrides,
  };
  await db.insert(auditLog).values(row);
  return row;
};

const ENTRY_KEYS = [
  "action",
  "actorEmail",
  "createdAt",
  "detail",
  "id",
  "objectId",
  "objectName",
  "objectType",
  "origin",
  "result",
];

describe("GET /api/w/:wid/audit", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await read(workspace.id, undefined),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 404 for a non-member", async () => {
    const { workspace } = await seedWorkspaceWithRoles();
    const { A } = await seedTenantPair();

    await expectError(
      await read(workspace.id, A.users.owner),
      404,
      "NOT_FOUND",
    );
  });

  it("lets a viewer read entries with the exact DTO keys and actorEmail", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await insertAudit(workspace.id, {
      actorUserId: users.admin.id,
      action: "meta.budget.scale",
      objectType: "campaign",
      objectMetaId: "123",
      objectName: "Camp",
      detail: JSON.stringify({ from: 100, to: 120 }),
    });

    const response = await read(workspace.id, users.viewer);

    expect(response.status).toBe(200);
    const page = auditPageSchema.parse(await response.json());
    expect(page.nextCursor).toBeNull();
    expect(page.data).toHaveLength(1);
    const [entry] = page.data;
    expect(Object.keys(entry!).sort()).toEqual(ENTRY_KEYS);
    expect(entry).toMatchObject({
      actorEmail: users.admin.email,
      origin: "manual",
      action: "meta.budget.scale",
      objectType: "campaign",
      objectId: "123",
      objectName: "Camp",
      result: "ok",
      detail: { from: 100, to: 120 },
    });
  });

  it("returns null actorEmail and detail for system entries", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await insertAudit(workspace.id, { actorType: "system", origin: "system" });

    const page = await readPage(workspace.id, users.viewer);

    expect(page.data[0]).toMatchObject({ actorEmail: null, detail: null });
  });

  it("hides the superadmin's email from workspace members", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await insertAudit(workspace.id, {
      actorType: "superadmin",
      actorUserId: users.owner.id,
    });

    const page = await readPage(workspace.id, users.viewer);

    expect(page.data[0]!.actorEmail).toBeNull();
  });

  it("lists newest first", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const older = await insertAudit(workspace.id, { createdAt: 1_000 });
    const newer = await insertAudit(workspace.id, { createdAt: 2_000 });

    const page = await readPage(workspace.id, users.viewer);

    expect(idsOf(page)).toEqual([newer.id, older.id]);
  });

  it("lists only the workspace's own entries", async () => {
    const { A, B } = await seedTenantPair();
    const own = await insertAudit(A.workspace.id);
    await insertAudit(B.workspace.id);

    const page = await readPage(A.workspace.id, A.users.viewer);

    expect(idsOf(page)).toEqual([own.id]);
  });

  describe("filters", () => {
    it("filters by origin", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await insertAudit(workspace.id, { origin: "manual" });
      const pilot = await insertAudit(workspace.id, { origin: "pilot" });
      await insertAudit(workspace.id, { origin: "chat" });

      const page = await readPage(workspace.id, users.viewer, "?origin=pilot");

      expect(idsOf(page)).toEqual([pilot.id]);
    });

    it("filters by actorUserId", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await insertAudit(workspace.id, { actorUserId: users.owner.id });
      const byEditor = await insertAudit(workspace.id, {
        actorUserId: users.editor.id,
      });

      const page = await readPage(
        workspace.id,
        users.viewer,
        `?actorUserId=${users.editor.id}`,
      );

      expect(idsOf(page)).toEqual([byEditor.id]);
      expect(page.data[0]?.actorEmail).toBe(users.editor.email);
    });

    it("filters by action", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await insertAudit(workspace.id, { action: "settings.update" });
      const invite = await insertAudit(workspace.id, {
        action: "member.invite",
      });

      const page = await readPage(
        workspace.id,
        users.viewer,
        "?action=member.invite",
      );

      expect(idsOf(page)).toEqual([invite.id]);
    });

    it("filters by objectId", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await insertAudit(workspace.id, { objectMetaId: "111" });
      const target = await insertAudit(workspace.id, { objectMetaId: "222" });

      const page = await readPage(workspace.id, users.viewer, "?objectId=222");

      expect(idsOf(page)).toEqual([target.id]);
    });

    it("filters by from and to inclusive", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const day = (n: number) => Date.UTC(2026, 0, n);
      await insertAudit(workspace.id, { createdAt: day(1) });
      const second = await insertAudit(workspace.id, { createdAt: day(2) });
      const third = await insertAudit(workspace.id, { createdAt: day(3) });
      await insertAudit(workspace.id, { createdAt: day(4) });
      const range = `from=${new Date(day(2)).toISOString()}&to=${new Date(day(3)).toISOString()}`;

      const page = await readPage(workspace.id, users.viewer, `?${range}`);

      expect(idsOf(page)).toEqual([third.id, second.id]);
    });

    it("combines filters", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      await insertAudit(workspace.id, {
        origin: "pilot",
        actorUserId: users.owner.id,
      });
      await insertAudit(workspace.id, {
        origin: "manual",
        actorUserId: users.admin.id,
      });
      const match = await insertAudit(workspace.id, {
        origin: "manual",
        actorUserId: users.owner.id,
      });

      const page = await readPage(
        workspace.id,
        users.viewer,
        `?origin=manual&actorUserId=${users.owner.id}`,
      );

      expect(idsOf(page)).toEqual([match.id]);
    });
  });

  describe("pagination", () => {
    it("pages with a cursor without gaps or repeats, including equal timestamps", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const createdAts = [5_000, 5_000, 5_000, 4_000, 3_000];
      const inserted = [];
      for (const createdAt of createdAts) {
        inserted.push(await insertAudit(workspace.id, { createdAt }));
      }

      const first = await readPage(workspace.id, users.viewer, "?limit=2");
      const second = await readPage(
        workspace.id,
        users.viewer,
        `?limit=2&cursor=${first.nextCursor}`,
      );
      const third = await readPage(
        workspace.id,
        users.viewer,
        `?limit=2&cursor=${second.nextCursor}`,
      );

      expect(first.nextCursor).not.toBeNull();
      expect(second.nextCursor).not.toBeNull();
      expect(third.nextCursor).toBeNull();
      const seen = [...idsOf(first), ...idsOf(second), ...idsOf(third)];
      expect(seen).toHaveLength(5);
      expect([...seen].sort()).toEqual(inserted.map((row) => row.id).sort());
    });

    it("rejects a limit above the maximum", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();

      await expectError(
        await read(workspace.id, users.viewer, "?limit=101"),
        400,
        "VALIDATION",
      );
    });

    it("rejects an invalid cursor", async () => {
      const { workspace, users } = await seedWorkspaceWithRoles();

      await expectError(
        await read(workspace.id, users.viewer, "?cursor=garbage"),
        400,
        "VALIDATION",
      );
    });
  });

  describe("query validation", () => {
    it.each([
      ["unknown origin", "?origin=robot"],
      ["malformed from", "?from=yesterday"],
      ["from after to", "?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z"],
      ["empty action", "?action="],
    ])("rejects %s", async (_name, query) => {
      const { workspace, users } = await seedWorkspaceWithRoles();

      await expectError(
        await read(workspace.id, users.viewer, query),
        400,
        "VALIDATION",
      );
    });
  });
});
