import { describe, expect, it } from "vitest";
import {
  base64urlDecode,
  base64urlEncode,
  bytesToHex,
  hmacSha256,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "../../../src/api/lib/hash";

describe("sha256Hex", () => {
  it("matches known vectors", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("base64url", () => {
  it("round-trips arbitrary bytes without padding or unsafe chars", () => {
    const bytes = Uint8Array.from([251, 255, 190, 0, 1, 2, 253]);
    const encoded = base64urlEncode(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(base64urlDecode(encoded)).toEqual(bytes);
  });

  it("round-trips every length modulo 3", () => {
    for (let length = 0; length < 8; length++) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
    }
  });
});

describe("randomToken", () => {
  it("is base64url of 32 bytes by default", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64urlDecode(token)).toHaveLength(32);
  });

  it("honours the byte length and differs per call", () => {
    expect(base64urlDecode(randomToken(16))).toHaveLength(16);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("hmacSha256", () => {
  it("matches RFC 4231 test case 2", async () => {
    const mac = await hmacSha256("Jefe", "what do ya want for nothing?");
    expect(bytesToHex(mac)).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("timingSafeEqual", () => {
  it("is true for equal values", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
    expect(timingSafeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(
      true,
    );
  });

  it("is false for same-length different values", () => {
    expect(timingSafeEqual("secret", "secreT")).toBe(false);
  });

  it("is false for different lengths, including prefixes", () => {
    expect(timingSafeEqual("secret", "secret1")).toBe(false);
    expect(timingSafeEqual("secret", "")).toBe(false);
  });
});
