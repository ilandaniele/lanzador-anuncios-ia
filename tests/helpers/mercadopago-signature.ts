import { bytesToHex, hmacSha256 } from "../../src/api/lib/hash";
import { mercadoPagoManifest } from "../../src/api/lib/mercadopago-signature";

export const MP_TEST_WEBHOOK_SECRET = "test-mp-webhook-secret";

export interface SignedWebhook {
  dataId: string;
  requestId?: string;
  ts?: string;
  secret?: string;
  manifestDataId?: string;
}

export async function signMercadoPagoWebhook({
  dataId,
  requestId = "mp-request-1",
  ts = String(Date.now()),
  secret = MP_TEST_WEBHOOK_SECRET,
  manifestDataId = dataId,
}: SignedWebhook) {
  const manifest = mercadoPagoManifest(manifestDataId, requestId, ts);
  const v1 = bytesToHex(await hmacSha256(secret, manifest));
  return {
    "x-signature": `ts=${ts},v1=${v1}`,
    "x-request-id": requestId,
  };
}
