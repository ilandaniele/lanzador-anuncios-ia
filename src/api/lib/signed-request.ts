import { z } from "zod";
import { AppError } from "./errors";
import { base64urlDecode, hmacSha256, timingSafeEqual } from "./hash";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const SIGNED_ALGORITHM = "HMAC-SHA256";

const payloadSchema = z.object({
  algorithm: z.literal(SIGNED_ALGORITHM),
  user_id: z.string().min(1).max(64),
  issued_at: z.number().int().optional(),
});

export type SignedRequest = { metaUserId: string };

const badSignature = () => new AppError(400, "BAD_SIGNATURE");

function splitSignedRequest(value: unknown) {
  if (typeof value !== "string") throw badSignature();
  const parts = value.split(".");
  if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) {
    throw badSignature();
  }
  const [signature = "", payload = ""] = parts;
  return { signature, payload };
}

function decodePayload(payload: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(payload)));
  } catch {
    throw badSignature();
  }
}

async function hasValidSignature(
  signature: string,
  payload: string,
  appSecret: string,
): Promise<boolean> {
  const expected = await hmacSha256(appSecret, payload);
  try {
    return timingSafeEqual(base64urlDecode(signature), expected);
  } catch {
    return false;
  }
}

export async function parseSignedRequest(
  value: unknown,
  appSecret: string,
): Promise<SignedRequest> {
  if (!appSecret) throw new Error("META_APP_SECRET is not configured");
  const { signature, payload } = splitSignedRequest(value);
  if (!(await hasValidSignature(signature, payload, appSecret))) {
    throw badSignature();
  }
  const parsed = payloadSchema.safeParse(decodePayload(payload));
  if (!parsed.success) throw badSignature();
  return { metaUserId: parsed.data.user_id };
}
