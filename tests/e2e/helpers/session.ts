import {
  expect,
  test as base,
  type APIRequestContext,
  type APIResponse,
  type Playwright,
} from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type SessionState = Awaited<
  ReturnType<APIRequestContext["storageState"]>
>;

export const WORKSPACE_ID = "seed-workspace-a";
export const FOREIGN_WORKSPACE_ID = "seed-workspace-b";
export const OWNER_EMAIL = "owner-a@lanzador.test";
export const VIEWER_EMAIL = "viewer-a@lanzador.test";
export const SUPERADMIN_EMAIL = "admin@lanzador.test";
export const CSRF_HEADERS = { "X-Lanzador": "1" };
export const SIGN_IN_TIMEOUT_MS = 180_000;

const MAGIC_LINK_CAPPED =
  "Magic link not issued: 5 per email in 15 minutes. Wait or reset local login links.";
const RATE_LIMIT_ATTEMPTS = 6;
const RATE_LIMIT_BACKOFF_MS = 20_000;
const PACE_MS = 2_000;
const SESSION_CACHE_DIR = resolve(".wrangler/e2e-sessions");

export const csrfHeaders = (origin: string) => ({
  Origin: origin,
  ...CSRF_HEADERS,
});

export function e2eSecret() {
  if (process.env.E2E_SECRET) return process.env.E2E_SECRET;
  const varsFile = process.env.E2E_BASE_URL ? ".dev.vars.preview" : ".dev.vars";
  const line = readFileSync(varsFile, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("E2E_SECRET="));
  if (!line) throw new Error(`E2E_SECRET missing in env and ${varsFile}`);
  return line.slice("E2E_SECRET=".length);
}

export async function retryWhileRateLimited(
  send: () => Promise<APIResponse>,
): Promise<APIResponse> {
  for (let attempt = 1; ; attempt++) {
    const response = await send();
    if (response.status() !== 429 || attempt === RATE_LIMIT_ATTEMPTS) {
      return response;
    }
    await new Promise((done) => setTimeout(done, RATE_LIMIT_BACKOFF_MS));
  }
}

const postUnlessRateLimited = (
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["post"]>[1],
) => retryWhileRateLimited(() => request.post(path, options));

export async function signIn(
  request: APIRequestContext,
  origin: string,
  email = OWNER_EMAIL,
) {
  const headers = csrfHeaders(origin);
  const issued = await postUnlessRateLimited(request, "/api/test/magic-link", {
    headers: { ...headers, "X-E2E-Secret": e2eSecret() },
    data: { email },
  });
  expect(issued.ok()).toBe(true);
  const { link } = (await issued.json()) as { link: string | null };
  if (!link) throw new Error(MAGIC_LINK_CAPPED);
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("t");
  const verified = await postUnlessRateLimited(request, "/api/auth/verify", {
    headers,
    data: { token },
  });
  expect(verified.ok()).toBe(true);
}

const cachePath = (baseURL: string, email: string) =>
  resolve(
    SESSION_CACHE_DIR,
    `${new URL(baseURL).host}-${email}.json`.replace(/[^A-Za-z0-9.@-]/g, "_"),
  );

function readCachedState(baseURL: string, email: string) {
  try {
    return JSON.parse(
      readFileSync(cachePath(baseURL, email), "utf8"),
    ) as SessionState;
  } catch {
    return null;
  }
}

async function isLiveSession(
  playwright: Playwright,
  baseURL: string,
  storageState: SessionState,
) {
  const request = await playwright.request.newContext({
    baseURL,
    storageState,
  });
  const response = await retryWhileRateLimited(() => request.get("/api/me"));
  await request.dispose();
  return response.status() !== 401;
}

export async function signedInState(
  playwright: Playwright,
  baseURL: string,
  email: string,
) {
  const cached = readCachedState(baseURL, email);
  if (cached && (await isLiveSession(playwright, baseURL, cached))) {
    return cached;
  }
  const request = await playwright.request.newContext({ baseURL });
  await signIn(request, baseURL, email);
  const storageState = await request.storageState();
  await request.dispose();
  mkdirSync(SESSION_CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(baseURL, email), JSON.stringify(storageState));
  return storageState;
}

export const pacedTest = base.extend<{ rateLimitPacing: void }>({
  rateLimitPacing: [
    async ({ request }, use) => {
      await retryWhileRateLimited(() => request.get("/api/me"));
      await use();
      await new Promise((done) => setTimeout(done, PACE_MS));
    },
    { auto: true, timeout: RATE_LIMIT_ATTEMPTS * RATE_LIMIT_BACKOFF_MS },
  ],
});

export const signedInAs = (email: string) =>
  pacedTest.extend<{ origin: string }, { session: SessionState }>({
    session: [
      async ({ playwright }, use, { project }) =>
        use(await signedInState(playwright, project.use.baseURL!, email)),
      { scope: "worker", timeout: SIGN_IN_TIMEOUT_MS },
    ],
    storageState: ({ session }, use) => use(session),
    origin: ({ baseURL }, use) => use(baseURL!),
  });
