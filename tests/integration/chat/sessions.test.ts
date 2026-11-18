import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { appendChatMessages } from "../../../src/api/repositories/chat";
import type { Scope } from "../../../src/api/repositories/scope";
import { appendSessionMessages } from "../../../src/api/services/chat/sessions";
import { chatMessages, chatSessions } from "../../../src/db/schema/ops";
import {
  chatMessagesPageSchema,
  chatSessionResponseSchema,
  chatSessionsPageSchema,
} from "../../../src/shared/schemas/chat";
import {
  api,
  createChatMessage,
  createChatSession,
  expectError,
} from "../../helpers/factory";
import { seedWorkspaceWithRoles } from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

const sessionsPath = (workspaceId: string, suffix = "") =>
  `/api/w/${workspaceId}/chat/sessions${suffix}`;

const scopeOf = (workspaceId: string, user: { id: string }): Scope => ({
  workspaceId,
  userId: user.id,
  role: "editor",
});

const sessionRow = (id: string) =>
  db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .then(([row]) => row!);

const storedMessages = (sessionId: string) =>
  db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId));

const exchange = [
  { role: "user", content: "hola" },
  { role: "assistant", content: "buenas" },
] as const;

describe("POST /api/w/:wid/chat/sessions", () => {
  it("creates an open session owned by the caller", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(sessionsPath(workspace.id), {
      as: users.editor,
      method: "POST",
    });

    expect(response.status).toBe(201);
    const { session } = chatSessionResponseSchema.parse(await response.json());
    expect(session).toMatchObject({
      title: null,
      status: "open",
      launchId: null,
    });
    expect(await sessionRow(session.id)).toMatchObject({
      workspaceId: workspace.id,
      userId: users.editor.id,
      messageCount: 0,
    });
  });

  it("answers 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await call(sessionsPath(workspace.id), { method: "POST" }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("answers 403 to a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(sessionsPath(workspace.id), {
        as: users.viewer,
        method: "POST",
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });
});

describe("GET /api/w/:wid/chat/sessions", () => {
  it("lists only the caller sessions, newest first", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const older = await createChatSession(workspace.id, users.editor.id, {
      updatedAt: 1000,
    });
    const newer = await createChatSession(workspace.id, users.editor.id, {
      updatedAt: 2000,
    });
    await createChatSession(workspace.id, users.admin.id);

    const response = await call(sessionsPath(workspace.id), {
      as: users.editor,
    });

    const page = chatSessionsPageSchema.parse(await response.json());
    expect(page.data.map(({ id }) => id)).toEqual([newer.id, older.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("does not list sessions of another workspace", async () => {
    const mine = await seedWorkspaceWithRoles();
    const other = await seedWorkspaceWithRoles();
    await createChatSession(other.workspace.id, other.users.editor.id);

    const response = await call(sessionsPath(mine.workspace.id), {
      as: mine.users.editor,
    });

    expect(chatSessionsPageSchema.parse(await response.json()).data).toEqual(
      [],
    );
  });

  it("paginates with a cursor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const [first, second, third] = await Promise.all(
      [1000, 2000, 3000].map((updatedAt) =>
        createChatSession(workspace.id, users.editor.id, { updatedAt }),
      ),
    );
    const path = `${sessionsPath(workspace.id)}?limit=2`;

    const firstPage = chatSessionsPageSchema.parse(
      await (await call(path, { as: users.editor })).json(),
    );
    const secondPage = chatSessionsPageSchema.parse(
      await (
        await call(`${path}&cursor=${firstPage.nextCursor}`, {
          as: users.editor,
        })
      ).json(),
    );

    expect(firstPage.data.map(({ id }) => id)).toEqual([third!.id, second!.id]);
    expect(secondPage.data.map(({ id }) => id)).toEqual([first!.id]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects a limit above the maximum", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(`${sessionsPath(workspace.id)}?limit=101`, {
        as: users.editor,
      }),
      400,
      "VALIDATION",
    );
  });
});

describe("GET /api/w/:wid/chat/sessions/:id/messages", () => {
  const seedConversation = async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const session = await createChatSession(workspace.id, users.editor.id);
    await createChatMessage(workspace.id, session.id, "user", {
      content: "buscame un producto",
      createdAt: 1000,
    });
    await createChatMessage(workspace.id, session.id, "tool", {
      content: "resultado interno",
      toolName: "search_products",
      toolPayload: "{}",
      createdAt: 1001,
    });
    await createChatMessage(workspace.id, session.id, "assistant", {
      content: "encontre uno",
      createdAt: 1002,
    });
    return {
      users,
      path: sessionsPath(workspace.id, `/${session.id}/messages`),
    };
  };

  it("returns the conversation in order without tool messages", async () => {
    const { users, path } = await seedConversation();

    const response = await call(path, { as: users.editor });

    const page = chatMessagesPageSchema.parse(await response.json());
    expect(page.data.map(({ role, content }) => [role, content])).toEqual([
      ["user", "buscame un producto"],
      ["assistant", "encontre uno"],
    ]);
    expect(JSON.stringify(page)).not.toContain("resultado interno");
  });

  it("paginates with a cursor", async () => {
    const { users, path } = await seedConversation();

    const firstPage = chatMessagesPageSchema.parse(
      await (await call(`${path}?limit=1`, { as: users.editor })).json(),
    );
    const secondPage = chatMessagesPageSchema.parse(
      await (
        await call(`${path}?limit=1&cursor=${firstPage.nextCursor}`, {
          as: users.editor,
        })
      ).json(),
    );

    expect(firstPage.data.map(({ role }) => role)).toEqual(["user"]);
    expect(secondPage.data.map(({ role }) => role)).toEqual(["assistant"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("answers 404 for another user session in the same workspace", async () => {
    const { users, path } = await seedConversation();

    await expectError(await call(path, { as: users.admin }), 404, "NOT_FOUND");
  });

  it("answers 404 for an unknown session", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(sessionsPath(workspace.id, "/missing/messages"), {
        as: users.editor,
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("appendSessionMessages", () => {
  const seedSession = async (
    overrides: Partial<typeof chatSessions.$inferInsert> = {},
  ) => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const session = await createChatSession(
      workspace.id,
      users.editor.id,
      overrides,
    );
    return {
      workspace,
      users,
      session,
      scope: scopeOf(workspace.id, users.editor),
    };
  };

  it("stores the messages and counts them", async () => {
    const { session, scope } = await seedSession();

    await appendSessionMessages(env.DB, scope, session.id, [...exchange]);

    expect(await storedMessages(session.id)).toHaveLength(2);
    expect(await sessionRow(session.id)).toMatchObject({
      messageCount: 2,
      status: "open",
    });
  });

  it("closes the session when it reaches 60 messages", async () => {
    const { session, scope } = await seedSession({ messageCount: 58 });

    await appendSessionMessages(env.DB, scope, session.id, [...exchange]);

    expect(await sessionRow(session.id)).toMatchObject({
      messageCount: 60,
      status: "closed",
    });
  });

  it("answers 409 SESSION_CLOSED once the session is closed", async () => {
    const { session, scope } = await seedSession({
      messageCount: 60,
      status: "closed",
    });

    await expect(
      appendSessionMessages(env.DB, scope, session.id, [exchange[0]]),
    ).rejects.toMatchObject({ status: 409, code: "SESSION_CLOSED" });
    expect(await storedMessages(session.id)).toHaveLength(0);
  });

  it("rejects a batch that would pass 60 and stores nothing", async () => {
    const { session, scope } = await seedSession({ messageCount: 59 });

    await expect(
      appendSessionMessages(env.DB, scope, session.id, [...exchange]),
    ).rejects.toMatchObject({ status: 409, code: "SESSION_CLOSED" });
    expect(await storedMessages(session.id)).toHaveLength(0);
    expect(await sessionRow(session.id)).toMatchObject({ messageCount: 59 });
  });

  it("rolls the messages back when the database cap is hit", async () => {
    const { session, scope } = await seedSession({ messageCount: 59 });

    const saved = await appendChatMessages(
      env.DB,
      scope,
      session.id,
      exchange.map((message) => ({ ...message, id: crypto.randomUUID() })),
      Date.now(),
    );

    expect(saved).toBe(false);
    expect(await storedMessages(session.id)).toHaveLength(0);
    expect(await sessionRow(session.id)).toMatchObject({ messageCount: 59 });
  });

  it("answers 404 for another user session", async () => {
    const { workspace, users, session } = await seedSession();

    await expect(
      appendSessionMessages(
        env.DB,
        scopeOf(workspace.id, users.admin),
        session.id,
        [exchange[0]],
      ),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
