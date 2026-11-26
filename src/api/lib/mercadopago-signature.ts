import { AppError } from "./errors";
import { bytesToHex, hmacSha256, timingSafeEqual } from "./hash";
import { now } from "./time";

const DATA_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ALPHANUMERIC_PATTERN = /^[a-z0-9]+$/i;
const TIMESTAMP_PATTERN = /^\d{1,16}$/;
const SECONDS_BELOW = 1e12;
const MAX_AGE_MS = 10 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

export const mercadoPagoManifest = (
  dataId: string,
  requestId: string,
  ts: string,
) => `id:${dataId};request-id:${requestId};ts:${ts};`;

const badSignature = () => new AppError(400, "BAD_SIGNATURE");

function parseSignatureHeader(header: string | undefined) {
  const parts = new Map(
    (header ?? "").split(",").map((part) => {
      const [key = "", ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()] as const;
    }),
  );
  return { ts: parts.get("ts"), v1: parts.get("v1") };
}

const manifestDataId = (dataId: string) =>
  ALPHANUMERIC_PATTERN.test(dataId) ? dataId.toLowerCase() : dataId;

function assertFreshTimestamp(ts: string) {
  if (!TIMESTAMP_PATTERN.test(ts)) throw badSignature();
  const value = Number(ts);
  const sentAt = value < SECONDS_BELOW ? value * 1000 : value;
  const age = now() - sentAt;
  if (age > MAX_AGE_MS || -age > MAX_FUTURE_MS) throw badSignature();
}

export async function verifyMercadoPagoSignature(input: {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}): Promise<string> {
  const { ts, v1 } = parseSignatureHeader(input.signature);
  if (!ts || !v1 || !input.requestId) throw badSignature();
  if (!input.dataId || !DATA_ID_PATTERN.test(input.dataId)) {
    throw badSignature();
  }

  const manifest = mercadoPagoManifest(
    manifestDataId(input.dataId),
    input.requestId,
    ts,
  );
  const expected = bytesToHex(await hmacSha256(input.secret, manifest));
  if (!timingSafeEqual(expected, v1.toLowerCase())) throw badSignature();
  assertFreshTimestamp(ts);
  return input.dataId;
}
