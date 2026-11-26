import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import type { Env } from "../../../src/api/env";
import { sha256Hex } from "../../../src/api/lib/hash";
import {
  type GoogleLoginFailure,
  meSchema,
} from "../../../src/shared/schemas/auth";
import { createUser } from "../../helpers/factory";
import { captureRequests, readForm } from "../../helpers/meta-graph";
import {
  GOOGLE_TOKEN_URL,
  googleLoginExchange,
  googleTokenFails,
} from "../../helpers/msw/google";
import { server } from "../../helpers/msw/server";
import {
  openLimiter,
  ORIGIN,
  readEnvelope,
  testEnv,
  trustedHeaders,
} from "../pipeline/helpers";

const CLIENT_ID = "google-client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "google-client-secret";
const START = "/api/auth/google/start";
const CALLBACK = "/api/auth/google/callback";
const STATE_COOKIE = "__Host-lanzador_gstate";
const SESSION_COOKIE = "__Host-lanzador_sid";
const HOUR_SEC = 3600;

const envFor = (overrides: Partial<Env> = {}) =>
  testEnv({
    RL_AUTH: openLimiter,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    SUPERADMIN_EMAIL: "",
    REVIEWER_EMAIL: "",
    ...overrides,
  });

const get = (
  path: string,
  { cookie, env: overrides }: { cookie?: string; env?: Partial<Env> } = {},
) =>
  createApp().request(
    path,
    {
      method: "GET",
      headers: { ...trustedHeaders, ...(cookie ? { Cookie: cookie } : {}) },
    },
    envFor(overrides),
  );

const uniqueEmail = (domain = "gmail.com") =>
  `${crypto.randomUUID()}@${domain}`;

const insertBetaInvite = (email: string) =>
  env.DB.prepare(
    "INSERT INTO beta_invites (id, email, created_at) VALUES (?, ?, ?)",
  )
    .bind(crypto.randomUUID(), email, Date.now())
    .run();

const findUser = (email: string) =>
  env.DB.prepare("SELECT id, is_superadmin FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; is_superadmin: number }>();

const countSessions = (email: string) =>
  env.DB.prepare(
    "SELECT count(*) AS total FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)",
  )
    .bind(email)
    .first<{ total: number }>()
    .then((row) => row!.total);

const cookieValue = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`));

async function startLogin() {
  const response = await get(START);
  const url = new URL(response.headers.get("Location")!);
  return { response, url, state: url.searchParams.get("state")! };
}

const validClaims = async (state: string, email: string) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + HOUR_SEC,
  nonce: await sha256Hex(state),
  email,
  email_verified: true,
});

async function signIn(
  email: string,
  {
    claims = {},
    overrides,
    sessionCookie,
  }: {
    claims?: Record<string, unknown>;
    overrides?: Partial<Env>;
    sessionCookie?: string;
  } = {},
) {
  const { state } = await startLogin();
  server.use(
    googleLoginExchange({ ...(await validClaims(state, email)), ...claims }),
  );
  return get(`${CALLBACK}?${new URLSearchParams({ code: "code_1", state })}`, {
    cookie: [`${STATE_COOKIE}=${state}`, sessionCookie]
      .filter(Boolean)
      .join("; "),
    env: overrides,
  });
}

function expectStateCleared(response: Response) {
  expect(cookieValue(response, STATE_COOKIE)).toBe(
    `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
}

function expectFailure(response: Response, reason: GoogleLoginFailure) {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(
    `/login?google=error&motivo=${reason}`,
  );
  expect(cookieValue(response, SESSION_COOKIE)).toBeUndefined();
  expectStateCleared(response);
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("GET /api/auth/google/start", () => {
  it("sets the state cookie and redirects to Google with state, nonce and redirect_uri", async () => {
    const { response, url, state } = await startLogin();

    expect(response.status).toBe(302);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}${CALLBACK}`,
      response_type: "code",
      scope: "openid email",
      prompt: "select_account",
      state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      nonce: await sha256Hex(state),
    });
    expect(cookieValue(response, STATE_COOKIE)).toBe(
      `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
  });

  it("generates a new state on every call", async () => {
    const first = await startLogin();
    const second = await startLogin();

    expect(first.state).not.toBe(second.state);
  });

  it("applies RL_AUTH", async () => {
    const response = await get(START, {
      env: { RL_AUTH: { limit: async () => ({ success: false }) } },
    });

    expect(response.status).toBe(429);
    expect((await readEnvelope(response)).code).toBe("RATE_LIMITED");
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
  ])(
    "redirects to INTERNAL without a state cookie when GOOGLE_CLIENT_ID is %s",
    async (_, clientId) => {
      const response = await get(START, {
        env: { GOOGLE_CLIENT_ID: clientId },
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "/login?google=error&motivo=INTERNAL",
      );
      expect(cookieValue(response, STATE_COOKIE)).toBeUndefined();
    },
  );
});

describe("GET /api/auth/google/callback", () => {
  it("applies RL_AUTH", async () => {
    const { state } = await startLogin();

    const response = await get(`${CALLBACK}?code=code_1&state=${state}`, {
      env: { RL_AUTH: { limit: async () => ({ success: false }) } },
    });

    expect(response.status).toBe(429);
    expect((await readEnvelope(response)).code).toBe("RATE_LIMITED");
  });

  it("answers STATE_INVALID without the state cookie", async () => {
    const { state } = await startLogin();

    const response = await get(`${CALLBACK}?code=code_1&state=${state}`);

    expectFailure(response, "STATE_INVALID");
  });

  it("answers STATE_INVALID when the state does not match the cookie", async () => {
    const { state } = await startLogin();

    const response = await get(`${CALLBACK}?code=code_1&state=${state}`, {
      cookie: `${STATE_COOKIE}=another-state`,
    });

    expectFailure(response, "STATE_INVALID");
  });

  it("answers STATE_INVALID without a state in the query", async () => {
    const { state } = await startLogin();

    const response = await get(`${CALLBACK}?code=code_1`, {
      cookie: `${STATE_COOKIE}=${state}`,
    });

    expectFailure(response, "STATE_INVALID");
  });

  it("answers GOOGLE_DENIED when the user cancels", async () => {
    const { state } = await startLogin();

    const response = await get(
      `${CALLBACK}?error=access_denied&state=${state}`,
      { cookie: `${STATE_COOKIE}=${state}` },
    );

    expectFailure(response, "GOOGLE_DENIED");
  });

  it("answers GOOGLE_DENIED without a code", async () => {
    const { state } = await startLogin();

    const response = await get(`${CALLBACK}?state=${state}`, {
      cookie: `${STATE_COOKIE}=${state}`,
    });

    expectFailure(response, "GOOGLE_DENIED");
  });

  it("sends the login redirect_uri and no refresh token request to Google", async () => {
    const email = uniqueEmail();
    await createUser({ email });
    const requests = captureRequests();

    await signIn(email);

    const exchange = requests.find(({ url }) => url === GOOGLE_TOKEN_URL)!;
    expect(Object.fromEntries(await readForm(exchange))).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `${ORIGIN}${CALLBACK}`,
      grant_type: "authorization_code",
      code: "code_1",
    });
  });

  it("answers TOKEN_EXCHANGE_FAILED when Google rejects the code", async () => {
    const { state } = await startLogin();
    server.use(googleTokenFails("invalid_grant"));

    const response = await get(`${CALLBACK}?code=code_1&state=${state}`, {
      cookie: `${STATE_COOKIE}=${state}`,
    });

    expectFailure(response, "TOKEN_EXCHANGE_FAILED");
  });

  it.each([
    ["audience", { aud: "another-client" }],
    ["nonce", { nonce: "another-nonce" }],
    ["missing nonce", { nonce: undefined }],
    ["issuer", { iss: "https://evil.example.test" }],
    ["expiry", { exp: Math.floor(Date.now() / 1000) - 1 }],
  ])("answers TOKEN_EXCHANGE_FAILED for a bad %s", async (_, claims) => {
    const email = uniqueEmail();
    await createUser({ email });

    expectFailure(await signIn(email, { claims }), "TOKEN_EXCHANGE_FAILED");
    expect(await countSessions(email)).toBe(0);
  });

  it("accepts the issuer without scheme", async () => {
    const email = uniqueEmail();
    await createUser({ email });

    const response = await signIn(email, {
      claims: { iss: "accounts.google.com" },
    });

    expect(response.headers.get("Location")).toBe("/");
  });

  it("answers EMAIL_UNVERIFIED when Google does not verify the email", async () => {
    const email = uniqueEmail();
    await createUser({ email });

    const response = await signIn(email, { claims: { email_verified: false } });

    expectFailure(response, "EMAIL_UNVERIFIED");
  });

  it.each([
    ["a consumer non-gmail email without hd", "example.test", {}],
    [
      "a Workspace hd that does not match the email domain",
      "example.test",
      { hd: "other.test" },
    ],
    ["an empty hd on a non-gmail email", "example.test", { hd: "" }],
    ["a gmail.com lookalike domain", "notgmail.com", {}],
  ])(
    "answers EMAIL_UNVERIFIED for %s and creates no user",
    async (_, domain, claims) => {
      const email = uniqueEmail(domain);
      await insertBetaInvite(email);

      expectFailure(await signIn(email, { claims }), "EMAIL_UNVERIFIED");
      expect(await findUser(email)).toBeNull();
    },
  );

  it("logs in a Workspace email whose hd matches the email domain", async () => {
    const email = uniqueEmail("example.test");
    await insertBetaInvite(email);

    const response = await signIn(email, { claims: { hd: "Example.Test" } });

    expect(response.headers.get("Location")).toBe("/");
    expect(cookieValue(response, SESSION_COOKIE)).toBeDefined();
    expect(await findUser(email)).not.toBeNull();
  });

  it("logs in an uninvited Workspace email", async () => {
    const email = uniqueEmail("example.test");

    const response = await signIn(email, { claims: { hd: "example.test" } });

    expect(response.headers.get("Location")).toBe("/");
    expect(cookieValue(response, SESSION_COOKIE)).toBeDefined();
    expect(await findUser(email)).not.toBeNull();
  });

  it("creates the user and the session for an uninvited email", async () => {
    const email = uniqueEmail();

    const response = await signIn(email);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expectStateCleared(response);
    expect(cookieValue(response, SESSION_COOKIE)).toBeDefined();
    expect(await findUser(email)).not.toBeNull();
    expect(await countSessions(email)).toBe(1);
  });

  it("answers NOT_ALLOWED for a disabled user even with a beta invite", async () => {
    const email = uniqueEmail();
    await createUser({ email, status: "disabled" });
    await insertBetaInvite(email);

    expectFailure(await signIn(email), "NOT_ALLOWED");
    expect(await countSessions(email)).toBe(0);
  });

  it("answers NOT_ALLOWED for the reviewer email", async () => {
    const email = uniqueEmail();
    await createUser({ email });

    const response = await signIn(email, {
      overrides: { REVIEWER_EMAIL: email.toUpperCase() },
    });

    expectFailure(response, "NOT_ALLOWED");
    expect(await countSessions(email)).toBe(0);
  });

  it("creates the user from a beta invite, sets the session and redirects home", async () => {
    const email = uniqueEmail();
    await insertBetaInvite(email);

    const response = await signIn(email, {
      claims: { email: ` ${email.toUpperCase()} ` },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expectStateCleared(response);
    const session = cookieValue(response, SESSION_COOKIE)!;
    expect(session).toMatch(
      new RegExp(`^${SESSION_COOKIE}=[^;]+; Path=/; HttpOnly; Secure`),
    );
    const user = await findUser(email);
    expect(user).not.toBeNull();

    const meResponse = await get("/api/me", {
      cookie: session.split(";")[0],
    });
    expect(meResponse.status).toBe(200);
    const me = meSchema.parse(await meResponse.json());
    expect(me.user).toMatchObject({ id: user!.id, email, isSuperadmin: false });
  });

  it("logs in an existing user", async () => {
    const user = await createUser({ email: uniqueEmail() });

    const response = await signIn(user.email);

    expect(response.headers.get("Location")).toBe("/");
    expect(cookieValue(response, SESSION_COOKIE)).toBeDefined();
    expect((await findUser(user.email))?.id).toBe(user.id);
  });

  it("ends the session the browser had before logging in", async () => {
    const user = await createUser({ email: uniqueEmail() });
    const first = await signIn(user.email);
    const previous = cookieValue(first, SESSION_COOKIE)!.split(";")[0];

    const second = await signIn(user.email, { sessionCookie: previous });

    expect(cookieValue(second, SESSION_COOKIE)).toBeDefined();
    expect(await countSessions(user.email)).toBe(1);
    expect((await get("/api/me", { cookie: previous })).status).toBe(401);
  });

  it("logs in the superadmin email and flags it", async () => {
    const email = uniqueEmail();

    const response = await signIn(email, {
      overrides: { SUPERADMIN_EMAIL: email },
    });

    expect(response.headers.get("Location")).toBe("/");
    expect(cookieValue(response, SESSION_COOKIE)).toBeDefined();
    expect((await findUser(email))?.is_superadmin).toBe(1);
  });
});
