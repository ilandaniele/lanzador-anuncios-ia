import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { ORIGIN, readEnvelope, testEnv, trustedHeaders } from "./helpers";

const app = createApp();
app.post("/echo", (c) => c.json({ ok: true }));

const send = (path: string, init: RequestInit) =>
  app.request(path, init, testEnv());

async function expectCsrfFailed(response: Response) {
  expect(response.status).toBe(403);
  const error = await readEnvelope(response);
  expect(error.code).toBe("CSRF_FAILED");
  expect(error.requestId).toBe(response.headers.get("X-Request-Id"));
}

describe("csrf", () => {
  it("accepts a mutation with matching Origin and X-Lanzador", async () => {
    const response = await send("/api/echo", {
      method: "POST",
      headers: trustedHeaders,
    });

    expect(response.status).toBe(200);
  });

  it("rejects a mutation without X-Lanzador", async () => {
    await expectCsrfFailed(
      await send("/api/echo", { method: "POST", headers: { Origin: ORIGIN } }),
    );
  });

  it("rejects a mutation from another origin", async () => {
    await expectCsrfFailed(
      await send("/api/echo", {
        method: "POST",
        headers: { ...trustedHeaders, Origin: "https://evil.example" },
      }),
    );
  });

  it("rejects a mutation without Origin", async () => {
    await expectCsrfFailed(
      await send("/api/echo", {
        method: "DELETE",
        headers: { "X-Lanzador": "1" },
      }),
    );
  });

  it.each(["PUT", "PATCH", "patch", "DELETE", "PROPFIND"])(
    "checks %s without trusted headers",
    async (method) => {
      await expectCsrfFailed(await send("/api/echo", { method }));
    },
  );

  it("rejects Origin null", async () => {
    await expectCsrfFailed(
      await send("/api/echo", {
        method: "POST",
        headers: { ...trustedHeaders, Origin: "null" },
      }),
    );
  });

  it("rejects everything when APP_ORIGIN is empty", async () => {
    const response = await app.request(
      "/api/echo",
      { method: "POST", headers: { Origin: "", "X-Lanzador": "1" } },
      testEnv({ APP_ORIGIN: "" }),
    );

    await expectCsrfFailed(response);
  });

  it.each(["GET", "HEAD"])("does not check %s", async (method) => {
    const response = await send("/api/health", { method });

    expect(response.status).toBe(200);
  });

  it.each([
    "/api/meta/deauthorize",
    "/api/meta/data-deletion",
    "/api/billing/mercadopago/webhook",
  ])("exempts the signed callback %s", async (path) => {
    const response = await app.request(
      path,
      { method: "POST" },
      testEnv({ META_APP_SECRET: "test-app-secret" }),
    );

    expect(response.status).toBe(400);
    expect((await readEnvelope(response)).code).toBe("BAD_SIGNATURE");
  });

  it("still checks an exempt path with a trailing slash", async () => {
    await expectCsrfFailed(
      await send("/api/meta/deauthorize/", { method: "POST" }),
    );
  });

  it("rejects CORS preflight", async () => {
    await expectCsrfFailed(
      await send("/api/echo", {
        method: "OPTIONS",
        headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
      }),
    );
  });
});
