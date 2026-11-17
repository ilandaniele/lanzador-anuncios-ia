import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const fetchHealth = () =>
  exports.default.fetch("http://example.com/api/health");

describe("response headers", () => {
  it("adds request id, secure headers and no-store to API responses", async () => {
    const response = await fetchHealth();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it("issues a different request id per request", async () => {
    const [first, second] = await Promise.all([fetchHealth(), fetchHealth()]);

    expect(first.headers.get("X-Request-Id")).not.toBe(
      second.headers.get("X-Request-Id"),
    );
  });
});
