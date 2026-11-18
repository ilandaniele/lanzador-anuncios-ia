import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { sha256Hex } from "../../../src/api/lib/hash";
import { aadFor, decryptToken } from "../../../src/api/lib/token-crypto";
import { googleConnections } from "../../../src/db/schema/meta";
import { auditLog } from "../../../src/db/schema/ops";
import { oauthStates } from "../../../src/db/schema/workspaces";
import {
  api,
  createLaunch,
  createUser,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { captureRequests, readForm } from "../../helpers/meta-graph";
import {
  DRIVE_FILE_SCOPE,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  googleAccessToken,
  googleCodeExchange,
  googleRevokes,
  googleServerError,
  googleTokenFails,
} from "../../helpers/msw/google";
import { server } from "../../helpers/msw/server";
import { openLimiter, ORIGIN } from "../pipeline/helpers";

const app = createApp();
const CLIENT_ID = "google-client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "google-client-secret";
const PICKER_API_KEY = "picker-api-key";
const PROJECT_NUMBER = "123456789012";
const REFRESH_TOKEN = "1//refresh-token-never-leaves";
const ACCESS_TOKEN = "ya29.short-lived-access";
const GOOGLE_EMAIL = "drive.user@gmail.test";
const CALLBACK = "/api/google/oauth/callback";
const UNTRUSTED_STATE_PATH = "/?google=error&motivo=STATE_INVALID";
const CONNECTIONS_PATH = (wid: string) => `/w/${wid}/ajustes/conexiones`;
const LAUNCH_PATH = (wid: string, launchId: string) =>
  `/w/${wid}/lanzador/${launchId}`;

const googleEnv = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
  GOOGLE_PICKER_API_KEY: PICKER_API_KEY,
  GOOGLE_PROJECT_NUMBER: PROJECT_NUMBER,
  RL_AUTH: openLimiter,
  RL_USER: openLimiter,
  RL_IP: openLimiter,
};

type User = Awaited<ReturnType<typeof createUser>>;

const request = (
  as: User | undefined,
  path: string,
  method = "GET",
  body?: unknown,
) => api(app, path, { as, method, body, env: googleEnv });

const connect = (as: User, wid: string, body: unknown = {}) =>
  request(as, `/api/w/${wid}/google/connect`, "POST", body);

async function startConnect(as: User, wid: string, body: unknown = {}) {
  const response = await connect(as, wid, body);
  expect(response.status).toBe(200);
  const { authorizeUrl } = (await response.json()) as { authorizeUrl: string };
  return new URL(authorizeUrl).searchParams.get("state")!;
}

const callback = (as: User | undefined, query: Record<string, string>) =>
  request(as, `${CALLBACK}?${new URLSearchParams(query)}`);

async function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(location);
  expect(await response.text()).not.toContain(REFRESH_TOKEN);
}

const readConnections = (wid: string) =>
  drizzle(env.DB)
    .select()
    .from(googleConnections)
    .where(eq(googleConnections.workspaceId, wid));

const readAudit = (wid: string, action: string) =>
  drizzle(env.DB)
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.workspaceId, wid), eq(auditLog.action, action)));

async function editorWorkspace() {
  const editor = await createUser();
  const colleague = await createUser();
  const { workspace, owner } = await createWorkspace({
    members: [
      { user: editor, role: "editor" },
      { user: colleague, role: "editor" },
    ],
  });
  return { editor, colleague, owner, wid: workspace.id };
}

async function connectGoogle(as: User, wid: string) {
  const state = await startConnect(as, wid);
  server.use(
    googleCodeExchange({ refreshToken: REFRESH_TOKEN, email: GOOGLE_EMAIL }),
  );
  await expectRedirect(
    await callback(as, { code: "code_1", state }),
    `${CONNECTIONS_PATH(wid)}?google=ok`,
  );
}

const routes = (wid: string) =>
  [
    ["POST", `/api/w/${wid}/google/connect`, {}],
    ["GET", `/api/w/${wid}/google/connection`],
    ["DELETE", `/api/w/${wid}/google/connection`],
    ["GET", `/api/w/${wid}/google/picker-token`],
  ] as const;

afterEach(() => {
  server.events.removeAllListeners();
});

describe("google routes guards", () => {
  it("answer 401 without a session", async () => {
    const { wid } = await editorWorkspace();
    for (const [method, path, body] of routes(wid)) {
      await expectError(
        await request(undefined, path, method, body),
        401,
        "UNAUTHENTICATED",
      );
    }
  });

  it("answer 403 to a viewer", async () => {
    const viewer = await createUser();
    const { workspace } = await createWorkspace({
      members: [{ user: viewer, role: "viewer" }],
    });
    const editorRoutes = routes(workspace.id).filter(
      ([method]) => method !== "DELETE",
    );
    for (const [method, path, body] of editorRoutes) {
      await expectError(
        await request(viewer, path, method, body),
        403,
        "FORBIDDEN_ROLE",
      );
    }
  });

  it("answer 404 to a non-member", async () => {
    const { wid } = await editorWorkspace();
    const outsider = await createUser();
    for (const [method, path, body] of routes(wid)) {
      await expectError(
        await request(outsider, path, method, body),
        404,
        "NOT_FOUND",
      );
    }
  });
});

describe("POST /api/w/:wid/google/connect", () => {
  it("returns the Google authorize URL with drive.file, openid and email", async () => {
    const { editor, wid } = await editorWorkspace();

    const response = await connect(editor, wid);

    expect(response.status).toBe(200);
    const { authorizeUrl } = (await response.json()) as {
      authorizeUrl: string;
    };
    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}${CALLBACK}`,
      response_type: "code",
      scope: `${DRIVE_FILE_SCOPE} openid email`,
      access_type: "offline",
      prompt: "consent",
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
  });

  it("stores only the state hash with the launch of the workspace", async () => {
    const { editor, wid } = await editorWorkspace();
    const launch = await createLaunch(wid);

    const state = await startConnect(editor, wid, { launchId: launch.id });

    const [row, ...others] = await drizzle(env.DB)
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.workspaceId, wid));
    expect(others).toHaveLength(0);
    expect(row).toMatchObject({
      stateHash: await sha256Hex(state),
      provider: "google",
      userId: editor.id,
      launchId: launch.id,
      usedAt: null,
    });
    expect(row!.expiresAt - row!.createdAt).toBe(10 * 60 * 1000);
  });

  it("answers 404 to a launch of another workspace and stores no state", async () => {
    const { editor, wid } = await editorWorkspace();
    const { workspace: other } = await createWorkspace();
    const foreign = await createLaunch(other.id);

    await expectError(
      await connect(editor, wid, { launchId: foreign.id }),
      404,
      "NOT_FOUND",
    );
    expect(
      await drizzle(env.DB)
        .select()
        .from(oauthStates)
        .where(eq(oauthStates.workspaceId, wid)),
    ).toHaveLength(0);
  });

  it("answers 404 to a launch that is no longer a draft", async () => {
    const { editor, wid } = await editorWorkspace();
    const launch = await createLaunch(wid, { status: "running" });

    await expectError(
      await connect(editor, wid, { launchId: launch.id }),
      404,
      "NOT_FOUND",
    );
  });

  it("rejects a launchId that is not a string", async () => {
    const { editor, wid } = await editorWorkspace();

    await expectError(
      await connect(editor, wid, { launchId: 42 }),
      400,
      "VALIDATION",
    );
  });
});

describe("GET /api/google/oauth/callback", () => {
  it("stores the refresh token encrypted and redirects to connections", async () => {
    const { editor, wid } = await editorWorkspace();
    const state = await startConnect(editor, wid);
    server.use(
      googleCodeExchange({ refreshToken: REFRESH_TOKEN, email: GOOGLE_EMAIL }),
    );
    const requests = captureRequests();

    await expectRedirect(
      await callback(editor, { code: "code_1", state }),
      `${CONNECTIONS_PATH(wid)}?google=ok`,
    );

    const exchange = requests.find(({ url }) => url === GOOGLE_TOKEN_URL)!;
    expect(Object.fromEntries(await readForm(exchange))).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `${ORIGIN}${CALLBACK}`,
      grant_type: "authorization_code",
      code: "code_1",
    });
    const [connection, ...others] = await readConnections(wid);
    expect(others).toHaveLength(0);
    expect(connection).toMatchObject({
      userId: editor.id,
      googleEmail: GOOGLE_EMAIL,
      status: "active",
    });
    const ciphertext = new Uint8Array(connection!.refreshTokenCiphertext);
    expect(new TextDecoder().decode(ciphertext)).not.toContain(REFRESH_TOKEN);
    expect(
      await decryptToken(
        env,
        {
          ciphertext,
          iv: new Uint8Array(connection!.refreshTokenIv),
          keyVersion: connection!.tokenKeyVersion,
        },
        aadFor("google_connections", `${connection!.id}:${editor.id}`, wid),
      ),
    ).toBe(REFRESH_TOKEN);
    const [audit] = await readAudit(wid, "google.connection.connect");
    expect(audit).toMatchObject({ actorUserId: editor.id, origin: "manual" });
    expect(audit!.detail).not.toContain(REFRESH_TOKEN);
  });

  it("redirects back to the launch when the state carries one", async () => {
    const { editor, wid } = await editorWorkspace();
    const launch = await createLaunch(wid);
    const state = await startConnect(editor, wid, { launchId: launch.id });
    server.use(
      googleCodeExchange({ refreshToken: REFRESH_TOKEN, email: GOOGLE_EMAIL }),
    );

    await expectRedirect(
      await callback(editor, { code: "code_1", state }),
      `${LAUNCH_PATH(wid, launch.id)}?google=ok`,
    );
  });

  it("redirects an error back to the launch when the user cancels", async () => {
    const { editor, wid } = await editorWorkspace();
    const launch = await createLaunch(wid);
    const state = await startConnect(editor, wid, { launchId: launch.id });

    await expectRedirect(
      await callback(editor, { error: "access_denied", state }),
      `${LAUNCH_PATH(wid, launch.id)}?google=error&motivo=GOOGLE_DENIED`,
    );
    expect(await readConnections(wid)).toHaveLength(0);
  });

  it("redirects an error to connections when the exchange fails", async () => {
    const { editor, wid } = await editorWorkspace();
    const state = await startConnect(editor, wid);
    server.use(googleTokenFails("invalid_grant"));

    await expectRedirect(
      await callback(editor, { code: "code_1", state }),
      `${CONNECTIONS_PATH(wid)}?google=error&motivo=TOKEN_EXCHANGE_FAILED`,
    );
    expect(await readConnections(wid)).toHaveLength(0);
  });

  it("retries the exchange once on 5xx", async () => {
    const { editor, wid } = await editorWorkspace();
    const state = await startConnect(editor, wid);
    server.use(googleServerError(GOOGLE_TOKEN_URL));
    const requests = captureRequests();

    await expectRedirect(
      await callback(editor, { code: "code_1", state }),
      `${CONNECTIONS_PATH(wid)}?google=error&motivo=TOKEN_EXCHANGE_FAILED`,
    );
    expect(requests.filter(({ url }) => url === GOOGLE_TOKEN_URL)).toHaveLength(
      2,
    );
  });

  it("rejects a grant without drive.file", async () => {
    const { editor, wid } = await editorWorkspace();
    const state = await startConnect(editor, wid);
    server.use(
      googleCodeExchange({
        refreshToken: REFRESH_TOKEN,
        email: GOOGLE_EMAIL,
        scope: "openid email",
      }),
    );

    await expectRedirect(
      await callback(editor, { code: "code_1", state }),
      `${CONNECTIONS_PATH(wid)}?google=error&motivo=MISSING_PERMISSIONS`,
    );
    expect(await readConnections(wid)).toHaveLength(0);
  });

  it("replaces the previous connection of the same user", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    const [first] = await readConnections(wid);

    await connectGoogle(editor, wid);

    const rows = await readConnections(wid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(first!.id);
  });

  it("sends an unauthenticated callback to login without consuming the state", async () => {
    const { editor, wid } = await editorWorkspace();
    const state = await startConnect(editor, wid);

    await expectRedirect(
      await callback(undefined, { code: "code_1", state }),
      "/login",
    );
    server.use(
      googleCodeExchange({ refreshToken: REFRESH_TOKEN, email: GOOGLE_EMAIL }),
    );
    await expectRedirect(
      await callback(editor, { code: "code_1", state }),
      `${CONNECTIONS_PATH(wid)}?google=ok`,
    );
  });

  describe("STATE_INVALID", () => {
    it("rejects a reused state", async () => {
      const { editor, wid } = await editorWorkspace();
      const state = await startConnect(editor, wid);
      server.use(
        googleCodeExchange({
          refreshToken: REFRESH_TOKEN,
          email: GOOGLE_EMAIL,
        }),
      );
      await callback(editor, { code: "code_1", state });

      await expectRedirect(
        await callback(editor, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects an expired state", async () => {
      const { editor, wid } = await editorWorkspace();
      const state = await startConnect(editor, wid);
      await drizzle(env.DB)
        .update(oauthStates)
        .set({ expiresAt: Date.now() - 1 })
        .where(eq(oauthStates.stateHash, await sha256Hex(state)));

      await expectRedirect(
        await callback(editor, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects another member's state", async () => {
      const { editor, colleague, wid } = await editorWorkspace();
      const state = await startConnect(editor, wid);

      await expectRedirect(
        await callback(colleague, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
      expect(await readConnections(wid)).toHaveLength(0);
    });

    it("rejects a Meta state", async () => {
      const { editor, wid } = await editorWorkspace();
      const state = await startConnect(editor, wid);
      await drizzle(env.DB)
        .update(oauthStates)
        .set({ provider: "meta" })
        .where(eq(oauthStates.stateHash, await sha256Hex(state)));

      await expectRedirect(
        await callback(editor, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects an unknown or missing state", async () => {
      const { editor } = await editorWorkspace();

      await expectRedirect(
        await callback(editor, { code: "code_1", state: "unknown" }),
        UNTRUSTED_STATE_PATH,
      );
      await expectRedirect(
        await callback(editor, { code: "code_1" }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects when the user was demoted to viewer", async () => {
      const { editor, wid } = await editorWorkspace();
      const state = await startConnect(editor, wid);
      await env.DB.prepare(
        "UPDATE memberships SET role = 'viewer' WHERE user_id = ?",
      )
        .bind(editor.id)
        .run();

      await expectRedirect(
        await callback(editor, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });
  });
});

describe("GET /api/w/:wid/google/connection", () => {
  it("shows the caller's connection without any token", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);

    const response = await request(editor, `/api/w/${wid}/google/connection`);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(REFRESH_TOKEN);
    expect(JSON.parse(text)).toEqual({
      connected: true,
      email: GOOGLE_EMAIL,
      status: "active",
    });
  });

  it("does not show the connection to another member", async () => {
    const { editor, colleague, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);

    const response = await request(
      colleague,
      `/api/w/${wid}/google/connection`,
    );

    expect(await response.json()).toEqual({
      connected: false,
      email: null,
      status: null,
    });
  });
});

describe("DELETE /api/w/:wid/google/connection", () => {
  it("revokes the refresh token at Google, deletes the row and audits", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    server.use(googleRevokes());
    const requests = captureRequests();

    const response = await request(
      editor,
      `/api/w/${wid}/google/connection`,
      "DELETE",
    );

    expect(response.status).toBe(204);
    const revoke = requests.find(({ url }) => url === GOOGLE_REVOKE_URL)!;
    expect((await readForm(revoke)).get("token")).toBe(REFRESH_TOKEN);
    expect(await readConnections(wid)).toHaveLength(0);
    const [audit] = await readAudit(wid, "google.connection.disconnect");
    expect(audit!.detail).toContain('"revoked":true');
  });

  it("deletes the row even when Google fails to revoke", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    server.use(googleServerError(GOOGLE_REVOKE_URL));

    const response = await request(
      editor,
      `/api/w/${wid}/google/connection`,
      "DELETE",
    );

    expect(response.status).toBe(204);
    expect(await readConnections(wid)).toHaveLength(0);
  });

  it("lets a member demoted to viewer disconnect", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    await env.DB.prepare(
      "UPDATE memberships SET role = 'viewer' WHERE user_id = ?",
    )
      .bind(editor.id)
      .run();
    server.use(googleRevokes());

    const response = await request(
      editor,
      `/api/w/${wid}/google/connection`,
      "DELETE",
    );

    expect(response.status).toBe(204);
    expect(await readConnections(wid)).toHaveLength(0);
  });

  it("deletes only the removed member's connection", async () => {
    const { editor, colleague, owner, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    await connectGoogle(colleague, wid);

    const response = await request(
      owner,
      `/api/w/${wid}/members/${editor.id}`,
      "DELETE",
    );

    expect(response.status).toBe(204);
    const remaining = await readConnections(wid);
    expect(remaining.map(({ userId }) => userId)).toEqual([colleague.id]);
  });

  it("answers 404 to a member without a connection and keeps the other's", async () => {
    const { editor, colleague, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);

    await expectError(
      await request(colleague, `/api/w/${wid}/google/connection`, "DELETE"),
      404,
      "NOT_FOUND",
    );
    expect(await readConnections(wid)).toHaveLength(1);
  });
});

describe("GET /api/w/:wid/google/picker-token", () => {
  it("returns a short access token from the stored refresh token", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    server.use(googleAccessToken(ACCESS_TOKEN, 3599));
    const requests = captureRequests();
    const before = Date.now();

    const response = await request(editor, `/api/w/${wid}/google/picker-token`);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(REFRESH_TOKEN);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body).toEqual({
      accessToken: ACCESS_TOKEN,
      expiresAt: expect.any(String),
      apiKey: PICKER_API_KEY,
      appId: PROJECT_NUMBER,
    });
    const expiresAt = Date.parse(body.expiresAt as string);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3599 * 1000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3599 * 1000);
    const refresh = requests.find(({ url }) => url === GOOGLE_TOKEN_URL)!;
    expect(Object.fromEntries(await readForm(refresh))).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      scope: "https://www.googleapis.com/auth/drive.file",
    });
  });

  it("marks the connection on invalid_grant and stops calling Google", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    server.use(googleTokenFails("invalid_grant"));
    const path = `/api/w/${wid}/google/picker-token`;

    await expectError(
      await request(editor, path),
      409,
      "GOOGLE_RECONNECT_REQUIRED",
    );
    const [connection] = await readConnections(wid);
    expect(connection!.status).toBe("reconnect_required");

    const requests = captureRequests();
    await expectError(
      await request(editor, path),
      409,
      "GOOGLE_RECONNECT_REQUIRED",
    );
    expect(requests).toHaveLength(0);
  });

  it("answers GOOGLE_RECONNECT_REQUIRED to a member without a connection", async () => {
    const { editor, colleague, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);

    await expectError(
      await request(colleague, `/api/w/${wid}/google/picker-token`),
      409,
      "GOOGLE_RECONNECT_REQUIRED",
    );
  });

  it("answers 502 GOOGLE_ERROR when Google keeps failing", async () => {
    const { editor, wid } = await editorWorkspace();
    await connectGoogle(editor, wid);
    server.use(googleServerError(GOOGLE_TOKEN_URL));

    await expectError(
      await request(editor, `/api/w/${wid}/google/picker-token`),
      502,
      "GOOGLE_ERROR",
    );
    const [connection] = await readConnections(wid);
    expect(connection!.status).toBe("active");
  });
});
