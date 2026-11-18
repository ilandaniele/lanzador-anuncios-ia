import { readFileSync } from "node:fs";

const OWNER_EMAIL = "owner-a@lanzador.test";
const CSRF_HEADERS = { "X-Lanzador": "1" };
const MAGIC_LINK_CAPPED =
  "Magic link not issued: 5 per email in 15 minutes. Wait or reset local login links.";

function e2eSecret() {
  if (process.env.E2E_SECRET) return process.env.E2E_SECRET;
  const line = readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("E2E_SECRET="));
  if (!line) throw new Error("E2E_SECRET missing in env and .dev.vars");
  return line.slice("E2E_SECRET=".length);
}

async function postJson(origin, path, headers, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...CSRF_HEADERS,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`POST ${path} failed with status ${response.status}`);
  return response;
}

export async function signInCookieHeader(origin) {
  const issued = await postJson(
    origin,
    "/api/test/magic-link",
    { "X-E2E-Secret": e2eSecret() },
    { email: OWNER_EMAIL },
  );
  const { link } = await issued.json();
  if (!link) throw new Error(MAGIC_LINK_CAPPED);
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("t");
  const verified = await postJson(origin, "/api/auth/verify", {}, { token });
  return verified.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
