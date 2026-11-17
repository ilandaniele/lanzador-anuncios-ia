import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent, scrub } from "../../../src/api/lib/logger";

const readLine = (log: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(String(log.mock.calls[0]![0]));

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes one JSON line and redacts sensitive keys at any depth", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("info", "test", {
      accessToken: "x",
      nested: { Authorization: "x", cookie: "x", ok: "kept" },
      password: "x",
      clientSecret: "x",
      apiKey: "x",
      signature: "x",
      signed_request: "x",
      sessionId: "x",
      sid: "x",
      magicLink: "x",
      authCode: "x",
      code: "INTERNAL",
    });

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]![0]);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      level: "info",
      event: "test",
      accessToken: "[redacted]",
      nested: {
        Authorization: "[redacted]",
        cookie: "[redacted]",
        ok: "kept",
      },
      password: "[redacted]",
      clientSecret: "[redacted]",
      apiKey: "[redacted]",
      signature: "[redacted]",
      signed_request: "[redacted]",
      sessionId: "[redacted]",
      sid: "[redacted]",
      magicLink: "[redacted]",
      authCode: "[redacted]",
      code: "INTERNAL",
    });
  });

  it("scrubs secrets inside string values", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("error", "test", {
      message: "call https://graph.facebook.com/me?access_token=EAABxyz failed",
      nested: { detail: "Authorization: Bearer abc.def" },
    });

    const line = readLine(log);
    expect(line.message).toBe("call https://graph.facebook.com/me failed");
    expect(line.nested.detail).toBe("Authorization: Bearer [redacted]");
  });

  it("does not throw when the console sink throws", () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("sink down");
    });

    expect(() => logEvent("error", "test")).not.toThrow();
  });
});

describe("scrub", () => {
  it.each([
    ["https://x.test/cb?code=abc#frag", "https://x.test/cb"],
    ["token EAABsecret123 leaked", "token [redacted] leaked"],
    ["header Bearer abc.def", "header Bearer [redacted]"],
    ["access_token=abc&x=1 next", "access_token=[redacted] next"],
    ["client_secret=abc", "client_secret=[redacted]"],
    ["password=abc", "password=[redacted]"],
    ["code=abc", "code=[redacted]"],
    ["signed_request=abc.def", "signed_request=[redacted]"],
    ["api_key=abc", "api_key=[redacted]"],
    ["plain message", "plain message"],
  ])("scrubs %s", (input, expected) => {
    expect(scrub(input)).toBe(expected);
  });
});
