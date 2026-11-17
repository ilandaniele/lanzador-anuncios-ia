import type { Env } from "../env";
import { AppError } from "./errors";
import { base64urlDecode } from "./hash";

type TokenKeyEnv = Pick<Env, "TOKEN_ENC_KEY_CURRENT">;

export interface SealedToken {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  keyVersion: number;
}

const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyCache = new Map<number, Promise<CryptoKey>>();

export function aadFor(table: string, id: string, workspaceId: string): string {
  return `${table}:${id}:${workspaceId}`;
}

function cryptoFailure(message: string): AppError {
  return new AppError(500, "INTERNAL", { message });
}

function getKey(env: TokenKeyEnv, version: number): Promise<CryptoKey> {
  const cached = keyCache.get(version);
  if (cached) return cached;
  const secret = (env as unknown as Record<string, unknown>)[
    `TOKEN_ENC_KEY_V${version}`
  ];
  if (typeof secret !== "string" || secret === "") {
    return Promise.reject(
      cryptoFailure(`Token key version ${version} is not configured`),
    );
  }
  const imported = crypto.subtle
    .importKey("raw", base64urlDecode(secret), "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ])
    .catch(() => {
      keyCache.delete(version);
      throw cryptoFailure(`Token key version ${version} is invalid`);
    });
  keyCache.set(version, imported);
  return imported;
}

export async function encryptToken(
  env: TokenKeyEnv,
  plaintext: string,
  aad: string,
): Promise<SealedToken> {
  const keyVersion = Number(env.TOKEN_ENC_KEY_CURRENT);
  const key = await getKey(env, keyVersion);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(plaintext),
  );
  return { ciphertext: new Uint8Array(ciphertext), iv, keyVersion };
}

export async function decryptToken(
  env: TokenKeyEnv,
  sealed: SealedToken,
  aad: string,
): Promise<string> {
  const key = await getKey(env, sealed.keyVersion);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: sealed.iv,
        additionalData: encoder.encode(aad),
      },
      key,
      sealed.ciphertext,
    );
    return decoder.decode(plaintext);
  } catch {
    throw cryptoFailure("Token decryption failed");
  }
}
