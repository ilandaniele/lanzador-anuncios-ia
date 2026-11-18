import { base64urlEncode, hmacSha256 } from "../../src/api/lib/hash";

export const META_TEST_APP_SECRET = "test-app-secret";

const encodeJson = (value: unknown) =>
  base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));

export async function signEncodedPayload(
  encodedPayload: string,
  secret = META_TEST_APP_SECRET,
): Promise<string> {
  const signature = await hmacSha256(secret, encodedPayload);
  return `${base64urlEncode(signature)}.${encodedPayload}`;
}

export const signRequest = (payload: unknown, secret?: string) =>
  signEncodedPayload(encodeJson(payload), secret);

export const signedRequestFor = (metaUserId: string, secret?: string) =>
  signRequest(
    {
      algorithm: "HMAC-SHA256",
      user_id: metaUserId,
      issued_at: Math.floor(Date.now() / 1000),
    },
    secret,
  );
