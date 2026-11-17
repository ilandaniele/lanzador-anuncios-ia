import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import type { Env } from "../../../src/api/env";
import { sha256Hex } from "../../../src/api/lib/hash";
import { session } from "../../../src/api/middleware/session";
import {
  createSession,
  destroySession,
} from "../../../src/api/services/auth/session";
import { blockedLimiter, readEnvelope, testEnv } from "../pipeline/helpers";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = 1_700_000_000_000;
const COOKIE = "__Host-lanzador_sid";
const CLEARED_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function buildApp() {
  const app = createApp();
  app.get("/me-test", session({ required: true }), (c) =>
    c.json(c.get("user")),
  );
  app.get("/optional-test", session({ required: false }), (c) =>
    c.json({ user: c.get("user") ?? null }),
  );
  return app;
}

const send = (
  path: string,
  token?: string,
  overrides: Partial<Env> = {},
  app = buildApp(),
) =>
  app.request(
    path,
    { headers: token ? { Cookie: `${COOKIE}=${token}` } : {} },
    testEnv(overrides),
  );

const request = (token?: string, overrides: Partial<Env> = {}) =>
  send("/api/me-test", token, overrides);

const at = (offsetMs: number) => vi.setSystemTime(START + offsetMs);

async function insertUser(status = "active"): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, `${id}@example.test`, "Ana", status, START)
    .run();
  return id;
}

async function login(status = "active") {
  const userId = await insertUser(status);
  const { token, cookie } = await createSession(env.DB, userId, {
    userAgent: "vitest",
    ip: "203.0.113.7",
  });
  return { userId, token, cookie };
}

const sessionRow = (userId: string) =>
  env.DB.prepare(
    "SELECT token_hash, previous_token_hash, last_seen_at, expires_at FROM sessions WHERE user_id = ?",
  )
    .bind(userId)
    .first<{
      token_hash: string;
      previous_token_hash: string | null;
      last_seen_at: number;
      expires_at: number;
    }>();

const tokenFrom = (setCookie: string | null) =>
  setCookie?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];

async function expectUnauthenticated(response: Response) {
  expect(response.status).toBe(401);
  expect((await readEnvelope(response)).code).toBe("UNAUTHENTICATED");
}

async function expectRejected(response: Response) {
  expect(response.headers.get("Set-Cookie")).toBe(CLEARED_COOKIE);
  await expectUnauthenticated(response);
}

const setRowColumn = (userId: string, column: string, value: number) =>
  env.DB.prepare(`UPDATE sessions SET ${column} = ? WHERE user_id = ?`)
    .bind(value, userId)
    .run();

describe("session", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers 401 without cookie and does not touch cookies", async () => {
    const response = await request();
    expect(response.headers.get("Set-Cookie")).toBeNull();
    await expectUnauthenticated(response);
  });

  it("answers 401 and clears the cookie for an unknown token", async () => {
    await expectRejected(await request("not-a-real-token"));
  });

  it("clears a dead cookie on optional routes and continues without user", async () => {
    const response = await send("/api/optional-test", "not-a-real-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED_COOKIE);
    expect(await response.json()).toEqual({ user: null });
  });

  it("lets optional routes through without a user", async () => {
    const response = await buildApp().request(
      "/api/optional-test",
      {},
      testEnv(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  it("issues a __Host- cookie and stores only the token hash", async () => {
    const { userId, token, cookie } = await login();

    expect(cookie).toBe(
      `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    );
    const row = await sessionRow(userId);
    expect(row?.token_hash).toBe(await sha256Hex(token));
    expect(row?.expires_at).toBe(START + 30 * DAY);

    const response = await request(token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: userId,
      email: `${userId}@example.test`,
      name: "Ana",
      isSuperadmin: false,
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("writes last_seen_at at most once per hour", async () => {
    const { userId, token } = await login();

    at(30 * MINUTE);
    expect((await request(token)).status).toBe(200);
    expect((await sessionRow(userId))?.last_seen_at).toBe(START);

    at(HOUR + MINUTE);
    expect((await request(token)).status).toBe(200);
    expect((await sessionRow(userId))?.last_seen_at).toBe(
      START + HOUR + MINUTE,
    );
  });

  it("rotates after 24 h and accepts the previous token for 60 s only", async () => {
    const { userId, token } = await login();

    at(DAY + MINUTE);
    const rotated = await request(token);
    expect(rotated.status).toBe(200);
    const newToken = tokenFrom(rotated.headers.get("Set-Cookie"));
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(token);
    expect(rotated.headers.get("Set-Cookie")).toContain(
      `Max-Age=${(30 * DAY - DAY - MINUTE) / 1000}`,
    );
    const row = await sessionRow(userId);
    expect(row?.previous_token_hash).toBe(await sha256Hex(token));
    expect(row?.expires_at).toBe(START + 30 * DAY);

    at(DAY + MINUTE + 59_000);
    const withinWindow = await request(token);
    expect(withinWindow.status).toBe(200);
    expect(withinWindow.headers.get("Set-Cookie")).toBeNull();

    at(DAY + MINUTE + 61_000);
    await expectRejected(await request(token));
    expect((await request(newToken)).status).toBe(200);
  });

  it("keeps the rotated cookie on responses that fail after the session", async () => {
    const { token } = await login();

    at(DAY + MINUTE);
    const response = await request(token, { RL_USER: blockedLimiter });
    expect(response.status).toBe(429);
    expect(tokenFrom(response.headers.get("Set-Cookie"))).toBeDefined();
  });

  it("never extends the 30-day absolute cap", async () => {
    const { token } = await login();
    let current = token;

    for (let day = 1; day < 30; day++) {
      at(day * DAY + MINUTE);
      const response = await request(current);
      expect(response.status).toBe(200);
      current = tokenFrom(response.headers.get("Set-Cookie")) ?? current;
    }

    at(30 * DAY);
    await expectRejected(await request(current));
  });

  it("answers 401 after 7 days of inactivity", async () => {
    const { token } = await login();

    at(7 * DAY);
    await expectRejected(await request(token));
  });

  it("answers 401 when the user is disabled", async () => {
    const { token } = await login("disabled");

    await expectRejected(await request(token));
  });

  it("answers 401 when the user is disabled after login", async () => {
    const { userId, token } = await login();
    expect((await request(token)).status).toBe(200);

    await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?")
      .bind(userId)
      .run();
    await expectRejected(await request(token));
  });

  it("answers 401 after destroySession", async () => {
    const { token } = await login();
    const user = await (await request(token)).json<{ sessionId: string }>();

    await destroySession(env.DB, user.sessionId);
    await expectRejected(await request(token));
  });

  it("rotates once when two requests race at 24 h", async () => {
    const { userId, token } = await login();
    const app = buildApp();

    at(DAY + MINUTE);
    const responses = await Promise.all([
      send("/api/me-test", token, {}, app),
      send("/api/me-test", token, {}, app),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const newTokens = responses
      .map((response) => tokenFrom(response.headers.get("Set-Cookie")))
      .filter(Boolean);
    expect(newTokens).toHaveLength(1);
    const { results } = await env.DB.prepare(
      "SELECT token_hash, previous_token_hash FROM sessions WHERE user_id = ?",
    )
      .bind(userId)
      .all();
    expect(results).toEqual([
      {
        token_hash: await sha256Hex(newTokens[0]!),
        previous_token_hash: await sha256Hex(token),
      },
    ]);
  });

  it("does not rotate again when the previous token is used inside the grace window", async () => {
    const { userId, token } = await login();

    at(DAY + MINUTE);
    expect((await request(token)).status).toBe(200);
    const rotatedRow = await sessionRow(userId);

    at(DAY + MINUTE + 30_000);
    const response = await request(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await sessionRow(userId)).toEqual(rotatedRow);
  });

  it.each([
    ["expired", "expires_at", DAY + MINUTE],
    ["idle", "last_seen_at", DAY + MINUTE - 7 * DAY],
  ])(
    "rejects the previous token inside the grace window on an %s session",
    async (_, column, value) => {
      const { userId, token } = await login();

      at(DAY + MINUTE);
      expect((await request(token)).status).toBe(200);
      await setRowColumn(userId, column, START + value);

      at(DAY + MINUTE + 30_000);
      await expectRejected(await request(token));
    },
  );

  it("applies RL_USER keyed by user id", async () => {
    const { userId, token } = await login();
    const keys: string[] = [];
    const recorder: RateLimit = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };

    expect((await request(token, { RL_USER: recorder })).status).toBe(200);
    expect(keys).toEqual([userId]);
  });
});
