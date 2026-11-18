import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import { sha256Hex } from "../../../src/api/lib/hash";
import { aadFor, decryptToken } from "../../../src/api/lib/token-crypto";
import { REQUIRED_META_SCOPES } from "../../../src/api/services/meta/oauth";
import { metaAssets, metaConnections } from "../../../src/db/schema/meta";
import { auditLog } from "../../../src/db/schema/ops";
import { oauthStates } from "../../../src/db/schema/workspaces";
import adAccountsFixture from "../../fixtures/meta/adaccounts.json";
import accountsFixture from "../../fixtures/meta/accounts.json";
import {
  api,
  createMetaConnection,
  createUser,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import {
  GRAPH_VERSION,
  graphUrl,
  metaFails,
  metaMe,
  metaReplies,
  metaServerError,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { openLimiter, ORIGIN } from "../pipeline/helpers";

const app = createApp();
const TOKEN = "EAABoauthFlowTestToken789";
const COMPETING_ID = "competing-connection";
const RACE_TRIGGER = "race_meta_connection";
const LONG_TOKEN = "EAABoauthLongLivedToken456";
const SHORT_EXPIRES_AT = 1_900_000_000;
const LONG_EXPIRES_AT = 1_907_776_000;
const APP_ID = "1234567890";
const CONFIG_ID = "cfg_42";
const BUSINESS_ID = "555000111";
const CALLBACK = "/api/meta/oauth/callback";
const OK_PATH = (wid: string) => `/w/${wid}/ajustes/conexiones?resultado=ok`;
const FAIL_PATH = (wid: string, reason: string) =>
  `/w/${wid}/ajustes/conexiones?resultado=error&motivo=${reason}`;
const UNTRUSTED_STATE_PATH = "/?resultado=error&motivo=STATE_INVALID";

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const oauthEnv = {
  ...keyEnv,
  GRAPH_API_VERSION: GRAPH_VERSION,
  META_APP_ID: APP_ID,
  META_APP_SECRET: "test-app-secret",
  META_LOGIN_CONFIG_ID: CONFIG_ID,
  RL_AUTH: openLimiter,
  RL_USER: openLimiter,
  RL_IP: openLimiter,
};

type User = Awaited<ReturnType<typeof createUser>>;

const tokenInfo = (overrides: Record<string, unknown> = {}) => ({
  data: {
    is_valid: true,
    app_id: APP_ID,
    type: "SYSTEM_USER",
    scopes: [...REQUIRED_META_SCOPES],
    granular_scopes: [
      { scope: "business_management", target_ids: [BUSINESS_ID] },
    ],
    expires_at: 0,
    ...overrides,
  },
});

const serveExchange = () =>
  server.use(metaReplies("oauth/access_token", { access_token: TOKEN }));

const serveDebugToken = (overrides?: Record<string, unknown>) =>
  server.use(metaReplies("debug_token", tokenInfo(overrides)));

const serveDiscovery = () =>
  server.use(
    metaMe(),
    metaReplies("me/adaccounts", adAccountsFixture),
    metaReplies("me/accounts", accountsFixture),
  );

const serveMeta = () => {
  serveExchange();
  serveDebugToken();
  serveDiscovery();
};

const connect = (as: User, workspaceId: string) =>
  api(app, `/api/w/${workspaceId}/meta/connect`, {
    as,
    method: "POST",
    env: oauthEnv,
  });

async function startConnect(as: User, workspaceId: string) {
  const response = await connect(as, workspaceId);
  expect(response.status).toBe(200);
  const { authorizeUrl } = (await response.json()) as { authorizeUrl: string };
  return new URL(authorizeUrl).searchParams.get("state")!;
}

const callback = (as: User | undefined, query: Record<string, string>) =>
  api(app, `${CALLBACK}?${new URLSearchParams(query)}`, {
    as,
    env: oauthEnv,
  });

async function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(location);
  expect(await response.text()).not.toContain(TOKEN);
}

async function adminWorkspace() {
  const { workspace, owner } = await createWorkspace();
  return { workspace, owner, wid: workspace.id };
}

const readConnections = (workspaceId: string) =>
  drizzle(env.DB)
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId));

const decryptStored = (
  connection: typeof metaConnections.$inferSelect,
  workspaceId: string,
) =>
  decryptToken(
    keyEnv,
    {
      ciphertext: new Uint8Array(connection.tokenCiphertext),
      iv: new Uint8Array(connection.tokenIv),
      keyVersion: connection.tokenKeyVersion,
    },
    aadFor("meta_connections", connection.id, workspaceId),
  );

const readAssets = (workspaceId: string) =>
  drizzle(env.DB)
    .select()
    .from(metaAssets)
    .where(eq(metaAssets.workspaceId, workspaceId));

const installRaceTrigger = () =>
  env.DB.prepare(
    `CREATE TRIGGER ${RACE_TRIGGER} BEFORE INSERT ON meta_connections WHEN NEW.id <> '${COMPETING_ID}' BEGIN INSERT INTO meta_connections (id, workspace_id, meta_business_id, meta_user_id, token_ciphertext, token_iv, token_key_version, created_at, updated_at) VALUES ('${COMPETING_ID}', NEW.workspace_id, NEW.meta_business_id, 'racer', x'00', x'00', 1, 1, 1); END`,
  ).run();

const readAudit = (workspaceId: string) =>
  drizzle(env.DB)
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.workspaceId, workspaceId),
        eq(auditLog.action, "meta.connection.connect"),
      ),
    );

afterEach(async () => {
  server.events.removeAllListeners();
  await env.DB.prepare(`DROP TRIGGER IF EXISTS ${RACE_TRIGGER}`).run();
});

describe("POST /api/w/:wid/meta/connect", () => {
  it("returns the Facebook Login authorize URL with every parameter", async () => {
    const { owner, wid } = await adminWorkspace();

    const response = await connect(owner, wid);

    expect(response.status).toBe(200);
    const { authorizeUrl } = (await response.json()) as {
      authorizeUrl: string;
    };
    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: APP_ID,
      redirect_uri: `${ORIGIN}${CALLBACK}`,
      config_id: CONFIG_ID,
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      response_type: "code",
      override_default_response_type: "true",
    });
  });

  it("stores only the state hash, bound to user and workspace for 10 minutes", async () => {
    const { owner, wid } = await adminWorkspace();

    const state = await startConnect(owner, wid);

    const rows = await drizzle(env.DB)
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.workspaceId, wid));
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row!.stateHash).toBe(await sha256Hex(state));
    expect(row!.stateHash).not.toBe(state);
    expect(row).toMatchObject({
      provider: "meta",
      userId: owner.id,
      usedAt: null,
    });
    expect(row!.expiresAt - row!.createdAt).toBe(10 * 60 * 1000);
  });

  it.each(["viewer", "editor"] as const)(
    "rejects a %s with 403",
    async (role) => {
      const user = await createUser();
      const { workspace } = await createWorkspace({
        members: [{ user, role }],
      });

      await expectError(
        await connect(user, workspace.id),
        403,
        "FORBIDDEN_ROLE",
      );
    },
  );
});

describe("GET /api/meta/oauth/callback", () => {
  describe("success", () => {
    it("stores the token encrypted, discovers assets and audits", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      serveMeta();

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        OK_PATH(wid),
      );

      const [connection, ...others] = await readConnections(wid);
      expect(others).toHaveLength(0);
      expect(connection).toMatchObject({
        metaBusinessId: BUSINESS_ID,
        businessName: "Negocio Demo",
        metaUserId: "100000000000001",
        status: "active",
        tokenType: "system_user",
        tokenExpiresAt: null,
        connectedBy: owner.id,
      });
      expect(JSON.parse(connection!.scopes!)).toEqual([
        ...REQUIRED_META_SCOPES,
      ]);
      const ciphertext = new Uint8Array(connection!.tokenCiphertext);
      expect(new TextDecoder().decode(ciphertext)).not.toContain(TOKEN);
      expect(
        await decryptToken(
          keyEnv,
          {
            ciphertext,
            iv: new Uint8Array(connection!.tokenIv),
            keyVersion: connection!.tokenKeyVersion,
          },
          aadFor("meta_connections", connection!.id, wid),
        ),
      ).toBe(TOKEN);

      const assets = await drizzle(env.DB)
        .select()
        .from(metaAssets)
        .where(eq(metaAssets.connectionId, connection!.id));
      expect(assets.map(({ metaId }) => metaId).sort()).toEqual(
        [
          "act_1001",
          "act_1002",
          "7001",
          "7002",
          "9001",
          "9002",
          "17841400000001",
        ].sort(),
      );

      const [audit] = await readAudit(wid);
      expect(audit).toMatchObject({
        actorUserId: owner.id,
        origin: "manual",
        objectType: "meta_connection",
        objectName: "Negocio Demo",
      });
      expect(audit!.detail).not.toContain(TOKEN);
    });

    it("exchanges the code with the app credentials and debugs with the app token", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      serveMeta();
      const requests = captureRequests();

      await callback(owner, { code: "code_1", state });

      const exchange = requests.find((request) =>
        request.url.startsWith(graphUrl("oauth/access_token")),
      )!;
      expect(Object.fromEntries(new URL(exchange.url).searchParams)).toEqual({
        client_id: APP_ID,
        client_secret: "test-app-secret",
        redirect_uri: `${ORIGIN}${CALLBACK}`,
        code: "code_1",
      });
      const debug = requests.find((request) =>
        request.url.startsWith(graphUrl("debug_token")),
      )!;
      expect(new URL(debug.url).searchParams.get("input_token")).toBe(TOKEN);
      expect(debug.headers.get("Authorization")).toBe(
        `Bearer ${APP_ID}|test-app-secret`,
      );
    });

    it("updates the existing connection of the same business instead of duplicating", async () => {
      const { owner, wid } = await adminWorkspace();
      const existing = await createMetaConnection(keyEnv, wid, "EAABoldToken", {
        metaBusinessId: BUSINESS_ID,
        status: "reconnect_required",
        lastErrorCode: 190,
        lastErrorAt: 1,
      });
      const state = await startConnect(owner, wid);
      serveMeta();

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        OK_PATH(wid),
      );

      const rows = await readConnections(wid);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: existing.id,
        status: "active",
        lastErrorCode: null,
        lastErrorAt: null,
      });
      expect(
        await decryptToken(
          keyEnv,
          {
            ciphertext: new Uint8Array(rows[0]!.tokenCiphertext),
            iv: new Uint8Array(rows[0]!.tokenIv),
            keyVersion: rows[0]!.tokenKeyVersion,
          },
          aadFor("meta_connections", existing.id, wid),
        ),
      ).toBe(TOKEN);
    });

    it("repairs a connection another callback created between lookup and write", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      serveMeta();
      await installRaceTrigger();

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        OK_PATH(wid),
      );

      const [connection, ...others] = await readConnections(wid);
      expect(others).toHaveLength(0);
      expect(connection!.id).toBe(COMPETING_ID);
      expect(connection!.metaUserId).toBe("100000000000001");
      expect(await decryptStored(connection!, wid)).toBe(TOKEN);
      const assets = await readAssets(wid);
      expect(assets).toHaveLength(7);
      expect(assets.every((row) => row.connectionId === COMPETING_ID)).toBe(
        true,
      );
      const [audit] = await readAudit(wid);
      expect(JSON.parse(audit!.detail!)).toMatchObject({
        connectionId: COMPETING_ID,
      });
    });

    it("keeps the same business in two workspaces fully independent", async () => {
      const first = await adminWorkspace();
      const second = await adminWorkspace();
      serveMeta();
      await callback(first.owner, {
        code: "code_1",
        state: await startConnect(first.owner, first.wid),
      });
      const [before] = await readConnections(first.wid);
      const assetsBefore = await readAssets(first.wid);

      await callback(second.owner, {
        code: "code_2",
        state: await startConnect(second.owner, second.wid),
      });

      const [mine] = await readConnections(second.wid);
      expect(mine!.id).not.toBe(before!.id);
      expect(await decryptStored(mine!, second.wid)).toBe(TOKEN);
      expect(await readConnections(first.wid)).toEqual([before]);
      expect(await readAssets(first.wid)).toEqual(assetsBefore);
      const secondAssets = await readAssets(second.wid);
      expect(secondAssets).toHaveLength(7);
      expect(secondAssets.every((row) => row.connectionId === mine!.id)).toBe(
        true,
      );
    });

    describe("USER token", () => {
      const isLongLivedExchange = (request: { url: string }) =>
        new URL(request.url).searchParams.get("grant_type") ===
        "fb_exchange_token";

      const serveUserFlow = () => {
        server.use(
          http.get(graphUrl("oauth/access_token"), ({ request }) =>
            HttpResponse.json({
              access_token: isLongLivedExchange(request) ? LONG_TOKEN : TOKEN,
            }),
          ),
          http.get(graphUrl("debug_token"), ({ request }) => {
            const input = new URL(request.url).searchParams.get("input_token");
            return HttpResponse.json(
              tokenInfo({
                type: "USER",
                expires_at:
                  input === LONG_TOKEN ? LONG_EXPIRES_AT : SHORT_EXPIRES_AT,
              }),
            );
          }),
        );
        serveDiscovery();
      };

      it("exchanges it for a long-lived token and stores its new expiry", async () => {
        const { owner, wid } = await adminWorkspace();
        const state = await startConnect(owner, wid);
        serveUserFlow();
        const requests = captureRequests();

        await expectRedirect(
          await callback(owner, { code: "code_1", state }),
          OK_PATH(wid),
        );

        const exchange = requests.find(isLongLivedExchange)!;
        expect(Object.fromEntries(new URL(exchange.url).searchParams)).toEqual({
          grant_type: "fb_exchange_token",
          client_id: APP_ID,
          client_secret: "test-app-secret",
          fb_exchange_token: TOKEN,
        });
        const [connection] = await readConnections(wid);
        expect(connection).toMatchObject({
          tokenType: "user",
          tokenExpiresAt: LONG_EXPIRES_AT * 1000,
        });
        expect(await decryptStored(connection!, wid)).toBe(LONG_TOKEN);
      });

      it("fails when the long-lived exchange fails", async () => {
        const { owner, wid } = await adminWorkspace();
        const state = await startConnect(owner, wid);
        serveUserFlow();
        server.use(
          http.get(graphUrl("oauth/access_token"), ({ request }) =>
            isLongLivedExchange(request)
              ? HttpResponse.json(
                  { error: { message: "no", type: "OAuthException", code: 1 } },
                  { status: 400 },
                )
              : HttpResponse.json({ access_token: TOKEN }),
          ),
        );

        await expectRedirect(
          await callback(owner, { code: "code_1", state }),
          FAIL_PATH(wid, "TOKEN_EXCHANGE_FAILED"),
        );
        expect(await readConnections(wid)).toHaveLength(0);
      });

      it("does not exchange a SYSTEM_USER token", async () => {
        const { owner, wid } = await adminWorkspace();
        const state = await startConnect(owner, wid);
        serveMeta();
        const requests = captureRequests();

        await callback(owner, { code: "code_1", state });

        expect(requests.some(isLongLivedExchange)).toBe(false);
      });
    });
  });

  describe("STATE_INVALID", () => {
    it("rejects a reused state", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      serveMeta();
      await callback(owner, { code: "code_1", state });

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects an expired state", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      await drizzle(env.DB)
        .update(oauthStates)
        .set({ expiresAt: Date.now() - 1 })
        .where(eq(oauthStates.stateHash, await sha256Hex(state)));

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects another user's state without burning it", async () => {
      const intruder = await createUser();
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);

      await expectRedirect(
        await callback(intruder, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
      serveMeta();
      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        OK_PATH(wid),
      );
    });

    it("rejects an unknown or missing state", async () => {
      const { owner } = await adminWorkspace();

      await expectRedirect(
        await callback(owner, { code: "code_1", state: "unknown" }),
        UNTRUSTED_STATE_PATH,
      );
      await expectRedirect(
        await callback(owner, { code: "code_1" }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects when the user stopped being admin", async () => {
      const user = await createUser();
      const { workspace } = await createWorkspace({
        members: [{ user, role: "admin" }],
      });
      const state = await startConnect(user, workspace.id);
      await env.DB.prepare(
        "UPDATE memberships SET role = 'editor' WHERE user_id = ?",
      )
        .bind(user.id)
        .run();

      await expectRedirect(
        await callback(user, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("rejects when the workspace is no longer active", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      await env.DB.prepare(
        "UPDATE workspaces SET status = 'disabled' WHERE id = ?",
      )
        .bind(wid)
        .run();

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        UNTRUSTED_STATE_PATH,
      );
    });

    it("ignores redirect hints in the query", async () => {
      const { owner } = await adminWorkspace();

      const response = await callback(owner, {
        state: "unknown",
        redirect_uri: "https://evil.example",
        next: "//evil.example",
      });

      await expectRedirect(response, UNTRUSTED_STATE_PATH);
    });
  });

  it("sends an unauthenticated callback to login without consuming the state", async () => {
    const { owner, wid } = await adminWorkspace();
    const state = await startConnect(owner, wid);

    await expectRedirect(
      await callback(undefined, { code: "code_1", state }),
      "/login",
    );
    serveMeta();
    await expectRedirect(
      await callback(owner, { code: "code_1", state }),
      OK_PATH(wid),
    );
  });

  it("redirects META_DENIED when the user cancels the dialog", async () => {
    const { owner, wid } = await adminWorkspace();
    const state = await startConnect(owner, wid);

    await expectRedirect(
      await callback(owner, { error: "access_denied", state }),
      FAIL_PATH(wid, "META_DENIED"),
    );
    expect(await readConnections(wid)).toHaveLength(0);
  });

  describe("TOKEN_EXCHANGE_FAILED", () => {
    const exchangeAttempts = (status: number) => {
      let attempts = 0;
      server.use(
        http.get(graphUrl("oauth/access_token"), () => {
          attempts++;
          return HttpResponse.json(
            { error: { message: "fail", type: "OAuthException", code: 1 } },
            { status },
          );
        }),
      );
      return () => attempts;
    };

    it("retries once on 5xx and then fails", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      const attempts = exchangeAttempts(500);

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        FAIL_PATH(wid, "TOKEN_EXCHANGE_FAILED"),
      );
      expect(attempts()).toBe(2);
    });

    it("succeeds when the retry after a 5xx works", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      let attempts = 0;
      server.use(
        http.get(graphUrl("oauth/access_token"), () =>
          attempts++ === 0
            ? new HttpResponse("upstream", { status: 503 })
            : HttpResponse.json({ access_token: TOKEN }),
        ),
      );
      serveDebugToken();
      serveDiscovery();

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        OK_PATH(wid),
      );
      expect(attempts).toBe(2);
    });

    it("does not retry on 4xx", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      const attempts = exchangeAttempts(400);

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        FAIL_PATH(wid, "TOKEN_EXCHANGE_FAILED"),
      );
      expect(attempts()).toBe(1);
    });

    it("logs the failing step without leaking the token or the code", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      server.use(metaServerError("oauth/access_token", 400));
      const logged = vi.spyOn(console, "log").mockImplementation(() => {});

      await callback(owner, { code: "secret_code_9", state });

      const lines = logged.mock.calls.map(([line]) => String(line));
      logged.mockRestore();
      const entry = lines.find((line) =>
        line.includes("meta.token_step_failed"),
      );
      expect(JSON.parse(entry!)).toMatchObject({
        step: "exchange_code",
        name: "MetaError",
        kind: expect.any(String),
        requestId: expect.any(String),
      });
      expect(lines.join("\n")).not.toContain("secret_code_9");
      expect(lines.join("\n")).not.toContain(TOKEN);
    });

    it("fails when debug_token errors", async () => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      serveExchange();
      server.use(metaServerError("debug_token", 502));

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        FAIL_PATH(wid, "TOKEN_EXCHANGE_FAILED"),
      );
    });

    it.each([
      ["invalid", { is_valid: false }],
      ["issued for another app", { app_id: "999" }],
      ["of an unknown type", { type: undefined }],
      ["a PAGE token", { type: "PAGE" }],
      ["an APP token", { type: "APP" }],
    ])("fails when the token is %s", async (_, overrides) => {
      const { owner, wid } = await adminWorkspace();
      const state = await startConnect(owner, wid);
      serveExchange();
      serveDebugToken(overrides);

      await expectRedirect(
        await callback(owner, { code: "code_1", state }),
        FAIL_PATH(wid, "TOKEN_EXCHANGE_FAILED"),
      );
      expect(await readConnections(wid)).toHaveLength(0);
    });
  });

  it("redirects MISSING_PERMISSIONS when a required scope is missing", async () => {
    const { owner, wid } = await adminWorkspace();
    const state = await startConnect(owner, wid);
    serveExchange();
    serveDebugToken({
      scopes: REQUIRED_META_SCOPES.filter(
        (scope) => scope !== "ads_management",
      ),
    });

    await expectRedirect(
      await callback(owner, { code: "code_1", state }),
      FAIL_PATH(wid, "MISSING_PERMISSIONS"),
    );
    expect(await readConnections(wid)).toHaveLength(0);
  });

  it("redirects META_ERROR when asset discovery fails", async () => {
    const { owner, wid } = await adminWorkspace();
    const state = await startConnect(owner, wid);
    serveExchange();
    serveDebugToken();
    server.use(
      metaMe(),
      metaFails("me/adaccounts", {
        error: { message: "boom", type: "OAuthException", code: 2 },
      }),
    );

    await expectRedirect(
      await callback(owner, { code: "code_1", state }),
      FAIL_PATH(wid, "META_ERROR"),
    );
    expect(await readConnections(wid)).toHaveLength(0);
  });
});
