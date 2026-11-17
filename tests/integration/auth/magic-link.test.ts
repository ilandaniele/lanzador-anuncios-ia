import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import type { Env } from "../../../src/api/env";
import { sha256Hex } from "../../../src/api/lib/hash";
import { meSchema } from "../../../src/shared/schemas/auth";
import { resendServerError, resendSuccess } from "../../helpers/msw/resend";
import { server } from "../../helpers/msw/server";
import {
  ORIGIN,
  readEnvelope,
  testEnv,
  trustedHeaders,
} from "../pipeline/helpers";

const COOKIE = "__Host-lanzador_sid";
const E2E_SECRET = "e2e-test-secret";
const HOUR = 3_600_000;

const openLimiter: RateLimit = { limit: async () => ({ success: true }) };

const envFor = (overrides: Partial<Env> = {}) =>
  testEnv({
    RL_AUTH: openLimiter,
    ENVIRONMENT: "development",
    SUPERADMIN_EMAIL: "",
    E2E_SECRET,
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Lanzador <login@example.test>",
    ...overrides,
  });

type SendOptions = {
  cookie?: string;
  headers?: Record<string, string>;
  env?: Partial<Env>;
};

async function send(
  method: string,
  path: string,
  body?: unknown,
  { cookie, headers = {}, env: overrides }: SendOptions = {},
) {
  const ctx = createExecutionContext();
  const response = await createApp().request(
    path,
    {
      method,
      headers: {
        ...trustedHeaders,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: `${COOKIE}=${cookie}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    envFor(overrides),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

const post = (path: string, body?: unknown, options?: SendOptions) =>
  send("POST", path, body, options);

const uniqueEmail = () => `${crypto.randomUUID()}@example.test`;

const captureEmails = () => {
  const requests: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
};

const readEmail = (request?: Request) =>
  request!.json<{ to: string[]; text: string }>();

const tokenIn = (text: string) => text.match(/#t=([A-Za-z0-9_-]+)/)?.[1];

async function insertUser(email: string, status = "active"): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, "Ana", status, Date.now())
    .run();
  return id;
}

async function insertWorkspace(ownerId: string, name = "Marca Demo") {
  const id = crypto.randomUUID();
  const at = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, name, ownerId, at, at),
    env.DB.prepare(
      "INSERT INTO memberships (id, workspace_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, 'owner', ?, ?)",
    ).bind(crypto.randomUUID(), id, ownerId, at, at),
  ]);
  return id;
}

const insertBetaInvite = (email: string, revokedAt: number | null = null) =>
  env.DB.prepare(
    "INSERT INTO beta_invites (id, email, created_at, revoked_at) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), email, Date.now(), revokedAt)
    .run();

async function insertInvitation(
  email: string,
  { expiresAt = Date.now() + HOUR, acceptedAt = null as number | null } = {},
) {
  const workspaceId = await insertWorkspace(await insertUser(uniqueEmail()));
  await env.DB.prepare(
    "INSERT INTO invitations (id, workspace_id, email, role, token_hash, created_at, expires_at, accepted_at) VALUES (?, ?, ?, 'editor', ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      workspaceId,
      email,
      crypto.randomUUID(),
      Date.now(),
      expiresAt,
      acceptedAt,
    )
    .run();
}

const linkRows = (email: string) =>
  env.DB.prepare(
    "SELECT token_hash, user_id, expires_at, created_at, invalidated_at, ip_hash FROM magic_links WHERE email = ?",
  )
    .bind(email)
    .all<{
      token_hash: string;
      user_id: string | null;
      expires_at: number;
      created_at: number;
      invalidated_at: number | null;
      ip_hash: string | null;
    }>()
    .then(({ results }) => results);

async function requestToken(email: string, overrides: Partial<Env> = {}) {
  server.use(resendSuccess());
  const emails = captureEmails();
  const response = await post(
    "/api/auth/magic-link",
    { email },
    { env: overrides },
  );
  server.events.removeAllListeners();
  expect(response.status).toBe(202);
  expect(emails).toHaveLength(1);
  const token = tokenIn((await readEmail(emails[0])).text);
  expect(token).toBeDefined();
  return token!;
}

const verify = (token: string, overrides: Partial<Env> = {}) =>
  post("/api/auth/verify", { token }, { env: overrides });

const cookieToken = (response: Response) =>
  response.headers
    .get("Set-Cookie")
    ?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];

async function loginAs(email: string) {
  const response = await verify(await requestToken(email));
  expect(response.status).toBe(200);
  return cookieToken(response)!;
}

async function uniqueUser() {
  const email = uniqueEmail();
  await insertUser(email);
  return email;
}

const me = (cookie?: string) => send("GET", "/api/me", undefined, { cookie });

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect((await readEnvelope(response)).code).toBe(code);
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/auth/magic-link", () => {
  it("answers 202 without row or email when not eligible", async () => {
    const email = uniqueEmail();
    server.use(resendSuccess());
    const emails = captureEmails();

    const response = await post("/api/auth/magic-link", { email });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(emails).toHaveLength(0);
    expect(await linkRows(email)).toHaveLength(0);
  });

  it("ignores disabled users, revoked beta invites and closed invitations", async () => {
    const disabled = uniqueEmail();
    const revoked = uniqueEmail();
    const expired = uniqueEmail();
    const accepted = uniqueEmail();
    await insertUser(disabled, "disabled");
    await insertBetaInvite(revoked, Date.now());
    await insertInvitation(expired, { expiresAt: Date.now() - 1 });
    await insertInvitation(accepted, { acceptedAt: Date.now() });
    server.use(resendSuccess());
    const emails = captureEmails();

    for (const email of [disabled, revoked, expired, accepted]) {
      expect((await post("/api/auth/magic-link", { email })).status).toBe(202);
      expect(await linkRows(email)).toHaveLength(0);
    }
    expect(emails).toHaveLength(0);
  });

  it("answers 202 without row or email for a disabled user with a pending beta invite", async () => {
    const email = uniqueEmail();
    await insertUser(email, "disabled");
    await insertBetaInvite(email);
    server.use(resendSuccess());
    const emails = captureEmails();

    const response = await post("/api/auth/magic-link", { email });

    expect(response.status).toBe(202);
    expect(emails).toHaveLength(0);
    expect(await linkRows(email)).toHaveLength(0);
  });

  it("answers 202 without row for a disabled superadmin", async () => {
    const email = uniqueEmail();
    await insertUser(email, "disabled");

    const response = await post(
      "/api/auth/magic-link",
      { email },
      { env: { SUPERADMIN_EMAIL: email } },
    );

    expect(response.status).toBe(202);
    expect(await linkRows(email)).toHaveLength(0);
  });

  const asSuperadmin = (email: string): Partial<Env> => ({
    SUPERADMIN_EMAIL: ` ${email.toUpperCase()} `,
  });

  it.each([
    ["an active user", async (email: string) => void (await insertUser(email))],
    [
      "a beta invite",
      async (email: string) => void (await insertBetaInvite(email)),
    ],
    ["a pending invitation", (email: string) => insertInvitation(email)],
    ["the superadmin email", async (email: string) => asSuperadmin(email)],
  ])("sends a hashed one-time link to %s", async (_, seed) => {
    const email = uniqueEmail();
    const overrides = (await seed(email)) ?? {};
    server.use(resendSuccess());
    const emails = captureEmails();

    const response = await post(
      "/api/auth/magic-link",
      { email: `  ${email.toUpperCase()} ` },
      {
        headers: { "CF-Connecting-IP": "203.0.113.7" },
        env: overrides,
      },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(emails).toHaveLength(1);
    const sent = await readEmail(emails[0]);
    expect(sent.to).toEqual([email]);
    expect(sent.text).toContain(`${ORIGIN}/ingresar/confirmar#t=`);
    const token = tokenIn(sent.text)!;
    const [row] = await linkRows(email);
    expect(row?.token_hash).toBe(await sha256Hex(token));
    expect(row?.token_hash).not.toContain(token);
    expect(row!.expires_at - row!.created_at).toBe(15 * 60_000);
    expect(row?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.invalidated_at).toBeNull();
  });

  it("links the existing user id on the row", async () => {
    const email = uniqueEmail();
    const userId = await insertUser(email);
    await requestToken(email);

    expect((await linkRows(email))[0]?.user_id).toBe(userId);
  });

  const requestFrom = (email: string, ip: string) =>
    post(
      "/api/auth/magic-link",
      { email },
      { headers: { "CF-Connecting-IP": ip } },
    );

  it("answers 202 without row or email on the 6th request for the same email and IP in 15 minutes", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    for (let i = 0; i < 5; i++) {
      expect((await requestFrom(email, "203.0.113.7")).status).toBe(202);
    }
    server.use(resendSuccess());
    const emails = captureEmails();

    const response = await requestFrom(email, "203.0.113.7");

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(emails).toHaveLength(0);
    expect(await linkRows(email)).toHaveLength(5);
  });

  it("caps at 15 links per email across IPs and still issues below the cap", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    for (let i = 0; i < 14; i++) {
      await requestFrom(email, `203.0.113.${i}`);
    }
    expect(await linkRows(email)).toHaveLength(14);
    server.use(resendSuccess());
    const emails = captureEmails();

    expect((await requestFrom(email, "198.51.100.1")).status).toBe(202);
    expect(await linkRows(email)).toHaveLength(15);
    expect(emails).toHaveLength(1);

    const capped = await requestFrom(email, "198.51.100.2");

    expect(capped.status).toBe(202);
    expect(await linkRows(email)).toHaveLength(15);
    expect(emails).toHaveLength(1);
  });

  it("applies only the per-email cap when the IP is unknown", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    for (let i = 0; i < 6; i++) await requestToken(email);

    expect(await linkRows(email)).toHaveLength(6);
  });

  it("answers 202 and invalidates the link when Resend fails twice", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    server.use(resendServerError());
    const emails = captureEmails();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await post("/api/auth/magic-link", { email });

    expect(response.status).toBe(202);
    expect(emails).toHaveLength(2);
    const [row] = await linkRows(email);
    expect(row?.invalidated_at).not.toBeNull();
    const { text } = await readEmail(emails[0]);
    expect((await verify(tokenIn(text)!)).status).toBe(410);
    const logged = log.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("magic_link_send_failed");
    expect(logged).not.toContain(tokenIn(text)!);
    expect(logged).not.toContain(email);
    log.mockRestore();
  });

  it("answers 413 for a body over 16 KB", async () => {
    const response = await post("/api/auth/magic-link", {
      email: uniqueEmail(),
      padding: "x".repeat(17 * 1024),
    });

    await expectError(response, 413, "PAYLOAD_TOO_LARGE");
  });

  it("answers 400 for an invalid email", async () => {
    await expectError(
      await post("/api/auth/magic-link", { email: "not-an-email" }),
      400,
      "VALIDATION",
    );
  });

  it("applies RL_AUTH", async () => {
    const response = await post(
      "/api/auth/magic-link",
      { email: uniqueEmail() },
      { env: { RL_AUTH: { limit: async () => ({ success: false }) } } },
    );

    await expectError(response, 429, "RATE_LIMITED");
  });

  it("still enforces CSRF", async () => {
    const response = await post(
      "/api/auth/magic-link",
      { email: uniqueEmail() },
      { headers: { "X-Lanzador": "" } },
    );

    await expectError(response, 403, "CSRF_FAILED");
  });
});

describe("POST /api/auth/verify", () => {
  it("logs in an existing user with the /api/me DTO and a session cookie", async () => {
    const email = uniqueEmail();
    const userId = await insertUser(email);
    const workspaceId = await insertWorkspace(userId);

    const response = await verify(await requestToken(email));

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toMatch(
      new RegExp(`^${COOKIE}=[^;]+; Path=/; HttpOnly; Secure`),
    );
    const body = meSchema.parse(await response.json());
    expect(body).toEqual({
      user: { id: userId, email, name: "Ana", isSuperadmin: false },
      workspaces: [
        {
          id: workspaceId,
          name: "Marca Demo",
          role: "owner",
          status: "active",
        },
      ],
    });
    const cookie = cookieToken(response);
    expect(await (await me(cookie)).json()).toEqual(body);
  });

  it("answers 410 when the link is reused", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    const token = await requestToken(email);

    expect((await verify(token)).status).toBe(200);
    await expectError(await verify(token), 410, "LINK_EXPIRED");
  });

  it("invalidates the other pending links of the email when one is used", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    const first = await requestToken(email);
    const second = await requestToken(email);

    expect((await verify(first)).status).toBe(200);

    await expectError(await verify(second), 410, "LINK_EXPIRED");
  });

  it("does not touch the links of other emails", async () => {
    const email = uniqueEmail();
    const other = uniqueEmail();
    await insertUser(email);
    await insertUser(other);
    const otherToken = await requestToken(other);

    expect((await verify(await requestToken(email))).status).toBe(200);

    expect((await verify(otherToken)).status).toBe(200);
  });

  it.each([
    ["expired", "expires_at = ?"],
    ["invalidated", "invalidated_at = ?"],
  ])("answers 410 when the link is %s", async (_, assignment) => {
    const email = uniqueEmail();
    await insertUser(email);
    const token = await requestToken(email);
    await env.DB.prepare(
      `UPDATE magic_links SET ${assignment} WHERE token_hash = ?`,
    )
      .bind(Date.now() - 1, await sha256Hex(token))
      .run();

    await expectError(await verify(token), 410, "LINK_EXPIRED");
  });

  it("answers 410 for an unknown token", async () => {
    await expectError(await verify("unknown-token"), 410, "LINK_EXPIRED");
  });

  it("creates the user on first login from a beta invite", async () => {
    const email = uniqueEmail();
    await insertBetaInvite(email);

    const response = await verify(await requestToken(email));

    expect(response.status).toBe(200);
    const body = meSchema.parse(await response.json());
    expect(body.user).toMatchObject({ email, isSuperadmin: false });
    expect(body.workspaces).toEqual([]);
    const user = await env.DB.prepare(
      "SELECT id, last_login_at FROM users WHERE email = ?",
    )
      .bind(email)
      .first<{ id: string; last_login_at: number | null }>();
    expect(user?.id).toBe(body.user.id);
    expect(user?.last_login_at).not.toBeNull();
  });

  it("answers 410 when a new user is no longer eligible", async () => {
    const email = uniqueEmail();
    await insertBetaInvite(email);
    const token = await requestToken(email);
    await env.DB.prepare(
      "UPDATE beta_invites SET revoked_at = ? WHERE email = ?",
    )
      .bind(Date.now(), email)
      .run();

    await expectError(await verify(token), 410, "LINK_EXPIRED");
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();
    expect(user).toBeNull();
  });

  it("flags the SUPERADMIN_EMAIL user as superadmin", async () => {
    const email = uniqueEmail();
    const superadmin = { SUPERADMIN_EMAIL: email };

    const response = await verify(
      await requestToken(email, superadmin),
      superadmin,
    );

    expect(response.status).toBe(200);
    const body = meSchema.parse(await response.json());
    expect(body.user).toMatchObject({ email, isSuperadmin: true });
  });

  it("demotes a user that is no longer the SUPERADMIN_EMAIL on next login", async () => {
    const email = uniqueEmail();
    const superadmin = { SUPERADMIN_EMAIL: email };
    expect(
      (await verify(await requestToken(email, superadmin), superadmin)).status,
    ).toBe(200);

    const response = await verify(await requestToken(email));

    expect(response.status).toBe(200);
    expect(meSchema.parse(await response.json()).user.isSuperadmin).toBe(false);
  });

  it("answers 410 for a disabled user", async () => {
    const email = uniqueEmail();
    await insertUser(email);
    const token = await requestToken(email);
    await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE email = ?")
      .bind(email)
      .run();

    await expectError(await verify(token), 410, "LINK_EXPIRED");
    expect(
      await env.DB.prepare(
        "SELECT id FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)",
      )
        .bind(email)
        .first(),
    ).toBeNull();
  });

  it("answers 400 without token", async () => {
    await expectError(await post("/api/auth/verify", {}), 400, "VALIDATION");
  });
});

describe("logout", () => {
  it("invalidates the current session", async () => {
    const cookie = await loginAs(await uniqueUser());

    const response = await post("/api/auth/logout", undefined, { cookie });

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain(
      `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
    await expectError(await me(cookie), 401, "UNAUTHENTICATED");
  });

  it("logout-all kills every session of the user and no one else's", async () => {
    const email = await uniqueUser();
    const laptop = await loginAs(email);
    const phone = await loginAs(email);
    const other = await loginAs(await uniqueUser());

    const response = await post("/api/auth/logout-all", undefined, {
      cookie: laptop,
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    await expectError(await me(laptop), 401, "UNAUTHENTICATED");
    await expectError(await me(phone), 401, "UNAUTHENTICATED");
    expect((await me(other)).status).toBe(200);
  });

  it.each(["/api/auth/logout", "/api/auth/logout-all"])(
    "%s answers 401 without session",
    async (path) => {
      await expectError(await post(path), 401, "UNAUTHENTICATED");
    },
  );

  it("still enforces CSRF", async () => {
    const cookie = await loginAs(await uniqueUser());

    const response = await post("/api/auth/logout", undefined, {
      cookie,
      headers: { "X-Lanzador": "" },
    });

    await expectError(response, 403, "CSRF_FAILED");
    expect((await me(cookie)).status).toBe(200);
  });
});

describe("GET /api/me", () => {
  it("answers 401 without session", async () => {
    await expectError(await me(), 401, "UNAUTHENTICATED");
  });

  it("lists the workspaces of the user's memberships only", async () => {
    const email = uniqueEmail();
    const userId = await insertUser(email);
    const own = await insertWorkspace(userId, "Propio");
    const shared = await insertWorkspace(
      await insertUser(uniqueEmail()),
      "Ajeno",
    );
    await insertWorkspace(await insertUser(uniqueEmail()), "Sin acceso");
    await env.DB.prepare(
      "INSERT INTO memberships (id, workspace_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, 'viewer', ?, ?)",
    )
      .bind(crypto.randomUUID(), shared, userId, Date.now(), Date.now())
      .run();
    await env.DB.prepare(
      "UPDATE workspaces SET status = 'disabled' WHERE id = ?",
    )
      .bind(shared)
      .run();

    const response = await me(await loginAs(email));

    expect(response.status).toBe(200);
    const body = meSchema.parse(await response.json());
    expect(body.workspaces).toHaveLength(2);
    expect(body.workspaces).toEqual(
      expect.arrayContaining([
        { id: own, name: "Propio", role: "owner", status: "active" },
        { id: shared, name: "Ajeno", role: "viewer", status: "disabled" },
      ]),
    );
  });
});

describe("POST /api/test/magic-link", () => {
  const requestTestLink = (
    email: string,
    secret: string | null = E2E_SECRET,
    overrides: Partial<Env> = {},
  ) =>
    post(
      "/api/test/magic-link",
      { email },
      {
        headers: secret === null ? {} : { "X-E2E-Secret": secret },
        env: overrides,
      },
    );

  it("answers 404 in production", async () => {
    const email = await uniqueUser();
    await expectError(
      await requestTestLink(email, E2E_SECRET, { ENVIRONMENT: "production" }),
      404,
      "NOT_FOUND",
    );
    expect(await linkRows(email)).toHaveLength(0);
  });

  it("answers 404 in an unlisted environment", async () => {
    const email = await uniqueUser();
    await expectError(
      await requestTestLink(email, E2E_SECRET, {
        ENVIRONMENT: "staging" as Env["ENVIRONMENT"],
      }),
      404,
      "NOT_FOUND",
    );
    expect(await linkRows(email)).toHaveLength(0);
  });

  it.each([
    ["a wrong secret", "wrong-secret", {}],
    ["no secret header", null, {}],
    ["no secret configured", "", { E2E_SECRET: "" }],
  ])("answers 404 with %s", async (_, secret, overrides) => {
    const email = await uniqueUser();
    await expectError(
      await requestTestLink(email, secret, overrides),
      404,
      "NOT_FOUND",
    );
    expect(await linkRows(email)).toHaveLength(0);
  });

  it("returns a link usable by verify without sending email", async () => {
    const email = await uniqueUser();
    server.use(resendSuccess());
    const emails = captureEmails();

    const response = await requestTestLink(email);

    expect(response.status).toBe(200);
    const { link } = await response.json<{ link: string }>();
    expect(link).toMatch(new RegExp(`^${ORIGIN}/ingresar/confirmar#t=`));
    expect(emails).toHaveLength(0);
    expect((await verify(tokenIn(link)!)).status).toBe(200);
  });
});
