import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import type { Env } from "../../../src/api/env";
import {
  blockedLimiter,
  readEnvelope,
  testEnv,
  trustedHeaders,
} from "../pipeline/helpers";

const CODE = "reviewer-code-0123456789abcdefghij";
const openLimiter: RateLimit = { limit: async () => ({ success: true }) };

const uniqueEmail = () => `${crypto.randomUUID()}@example.test`;

async function insertUser(email: string, status = "active") {
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), email, "Revisor", status, Date.now())
    .run();
}

async function send(
  path: string,
  body: unknown,
  overrides: Partial<Env>,
  headers: Record<string, string> = trustedHeaders,
) {
  const ctx = createExecutionContext();
  const response = await createApp().request(
    path,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    testEnv({ RL_AUTH: openLimiter, ...overrides }),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

const requestLink = (code: unknown, overrides: Partial<Env>) =>
  send("/api/auth/reviewer", { code }, overrides);

const linkCount = (email: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM magic_links WHERE email = ?")
    .bind(email)
    .first<{ n: number }>()
    .then((row) => row!.n);

async function reviewer() {
  const email = uniqueEmail();
  await insertUser(email);
  return { email, overrides: { REVIEWER_EMAIL: email, REVIEWER_CODE: CODE } };
}

async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  expect((await readEnvelope(response)).code).toBe("NOT_FOUND");
}

describe("POST /api/auth/reviewer", () => {
  it("returns a magic link that logs in the reviewer", async () => {
    const { email, overrides } = await reviewer();

    const response = await requestLink(CODE, overrides);

    expect(response.status).toBe(200);
    const { link } = await response.json<{ link: string }>();
    const token = link.match(/#t=([A-Za-z0-9_-]+)$/)?.[1];
    expect(token).toBeDefined();
    const verified = await send("/api/auth/verify", { token }, overrides);
    expect(verified.status).toBe(200);
    expect(
      (await verified.json<{ user: { email: string } }>()).user.email,
    ).toBe(email);
  });

  it("matches REVIEWER_EMAIL ignoring case and spaces", async () => {
    const { email, overrides } = await reviewer();
    const response = await requestLink(CODE, {
      ...overrides,
      REVIEWER_EMAIL: ` ${email.toUpperCase()} `,
    });
    expect(response.status).toBe(200);
    expect(await linkCount(email)).toBe(1);
  });

  it.each<[string, { code?: string; configured?: Partial<Env> }]>([
    ["a wrong code", { code: `${CODE}x` }],
    ["no code configured", { configured: { REVIEWER_CODE: undefined } }],
    ["no email configured", { configured: { REVIEWER_EMAIL: undefined } }],
    [
      "a configured code shorter than 32 characters",
      { code: "short", configured: { REVIEWER_CODE: "short" } },
    ],
  ])("answers 404 with %s", async (_, { code = CODE, configured = {} }) => {
    const { email, overrides } = await reviewer();
    await expectNotFound(
      await requestLink(code, { ...overrides, ...configured }),
    );
    expect(await linkCount(email)).toBe(0);
  });

  it("accepts a configured code with surrounding whitespace", async () => {
    const { overrides } = await reviewer();
    const response = await requestLink(CODE, {
      ...overrides,
      REVIEWER_CODE: ` ${CODE}
`,
    });
    expect(response.status).toBe(200);
  });

  it("answers 404 when REVIEWER_EMAIL is the superadmin", async () => {
    const { email, overrides } = await reviewer();
    await expectNotFound(
      await requestLink(CODE, { ...overrides, SUPERADMIN_EMAIL: email }),
    );
    expect(await linkCount(email)).toBe(0);
  });

  it("never issues a public magic link for REVIEWER_EMAIL", async () => {
    const { email, overrides } = await reviewer();
    const response = await send(
      "/api/auth/magic-link",
      { email: email.toUpperCase() },
      overrides,
    );
    expect(response.status).toBe(202);
    expect(await linkCount(email)).toBe(0);
  });

  it("answers 404 when the reviewer user is disabled", async () => {
    const email = uniqueEmail();
    await insertUser(email, "disabled");
    await expectNotFound(
      await requestLink(CODE, { REVIEWER_EMAIL: email, REVIEWER_CODE: CODE }),
    );
  });

  it("answers 400 without code", async () => {
    const { overrides } = await reviewer();
    expect((await send("/api/auth/reviewer", {}, overrides)).status).toBe(400);
  });

  it("applies RL_AUTH", async () => {
    const { overrides } = await reviewer();
    const response = await requestLink(CODE, {
      ...overrides,
      RL_AUTH: blockedLimiter,
    });
    expect(response.status).toBe(429);
  });

  it("still enforces CSRF", async () => {
    const { overrides } = await reviewer();
    const response = await send(
      "/api/auth/reviewer",
      { code: CODE },
      overrides,
      { ...trustedHeaders, "X-Lanzador": "" },
    );
    expect(response.status).toBe(403);
  });
});
