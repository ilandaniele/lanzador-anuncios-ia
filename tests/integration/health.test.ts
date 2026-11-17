import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("GET /api/health responds ok", async () => {
  const response = await exports.default.fetch("http://example.com/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
