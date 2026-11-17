import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { ipKey } from "../../../src/api/middleware/rate-limit";
import { blockedLimiter, readEnvelope, testEnv } from "./helpers";

describe("ipKey", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["unknown", "unknown"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:aaaa::1", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["2001:db8:1::", "2001:db8:1:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1:2:3:4", "fe80:0:0:0::/64"],
  ])("keys %s as %s", (ip, expected) => {
    expect(ipKey(ip)).toBe(expected);
  });
});

describe("rate limit", () => {
  it("answers 429 RATE_LIMITED with Retry-After when the IP limiter blocks", async () => {
    const response = await createApp().request(
      "/api/health",
      { headers: { "CF-Connecting-IP": "203.0.113.7" } },
      testEnv({ RL_IP: blockedLimiter }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    const error = await readEnvelope(response);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.requestId).toBe(response.headers.get("X-Request-Id"));
  });

  it("keys the IP limiter by client IP", async () => {
    const keys: string[] = [];
    const recorder: RateLimit = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };

    const response = await createApp().request(
      "/api/health",
      { headers: { "CF-Connecting-IP": "203.0.113.8" } },
      testEnv({ RL_IP: recorder }),
    );

    expect(response.status).toBe(200);
    expect(keys).toEqual(["203.0.113.8"]);
  });
});
