import { describe, expect, it } from "vitest";
import {
  aadFor,
  decryptToken,
  encryptToken,
} from "../../../src/api/lib/token-crypto";
import { AppError } from "../../../src/api/lib/errors";

function randomKeyBase64(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  );
}

const KEY_V1 = randomKeyBase64();
const KEY_V2 = randomKeyBase64();
const PLAINTEXT = "EAAB-meta-long-lived-token";
const AAD = aadFor("meta_connections", "conn_1", "ws_1");

const envV1 = { TOKEN_ENC_KEY_CURRENT: 1, TOKEN_ENC_KEY_V1: KEY_V1 };
const envV2 = { ...envV1, TOKEN_ENC_KEY_CURRENT: 2, TOKEN_ENC_KEY_V2: KEY_V2 };

describe("aadFor", () => {
  it("joins table, id and workspace id", () => {
    expect(aadFor("meta_connections", "conn_1", "ws_1")).toBe(
      "meta_connections:conn_1:ws_1",
    );
  });
});

describe("encryptToken / decryptToken", () => {
  it("round-trips with a 12-byte IV and the current key version", async () => {
    const sealed = await encryptToken(envV1, PLAINTEXT, AAD);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.keyVersion).toBe(1);
    expect(await decryptToken(envV1, sealed, AAD)).toBe(PLAINTEXT);
  });

  it("uses a different IV and ciphertext for each encryption", async () => {
    const first = await encryptToken(envV1, PLAINTEXT, AAD);
    const second = await encryptToken(envV1, PLAINTEXT, AAD);
    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it("fails to decrypt with the AAD of another row", async () => {
    const sealed = await encryptToken(envV1, PLAINTEXT, AAD);
    const otherRow = aadFor("meta_connections", "conn_2", "ws_1");
    const otherWorkspace = aadFor("meta_connections", "conn_1", "ws_2");
    await expect(decryptToken(envV1, sealed, otherRow)).rejects.toThrow(
      AppError,
    );
    await expect(decryptToken(envV1, sealed, otherWorkspace)).rejects.toThrow(
      AppError,
    );
  });

  it("decrypts old-version rows after the current version is bumped", async () => {
    const oldSealed = await encryptToken(envV1, PLAINTEXT, AAD);
    const newSealed = await encryptToken(envV2, PLAINTEXT, AAD);
    expect(newSealed.keyVersion).toBe(2);
    expect(await decryptToken(envV2, oldSealed, AAD)).toBe(PLAINTEXT);
    expect(await decryptToken(envV2, newSealed, AAD)).toBe(PLAINTEXT);
  });

  it("throws on an unknown key version without leaking secrets", async () => {
    const sealed = await encryptToken(envV1, PLAINTEXT, AAD);
    const error = await decryptToken(
      envV1,
      { ...sealed, keyVersion: 3 },
      AAD,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("INTERNAL");
    expect((error as Error).message).not.toContain(KEY_V1);
    expect((error as Error).message).not.toContain(PLAINTEXT);
  });

  it("throws when the current version has no key", async () => {
    const env = { ...envV1, TOKEN_ENC_KEY_CURRENT: 7 };
    await expect(encryptToken(env, PLAINTEXT, AAD)).rejects.toThrow(AppError);
  });

  it("does not leak plaintext or key material on a failed decrypt", async () => {
    const sealed = await encryptToken(envV1, PLAINTEXT, AAD);
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice() };
    tampered.ciphertext[0]! ^= 1;
    const error = await decryptToken(envV1, tampered, AAD).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as Error).message).not.toContain(KEY_V1);
    expect((error as Error).message).not.toContain(PLAINTEXT);
  });
});
