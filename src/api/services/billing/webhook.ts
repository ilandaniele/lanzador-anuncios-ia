import type { Env } from "../../env";
import { getAuthorizedPayment } from "../../integrations/mercadopago/client";
import { AppError } from "../../lib/errors";
import { verifyMercadoPagoSignature } from "../../lib/mercadopago-signature";
import { applyPreapproval } from "./apply-preapproval";
import { isBillingConfigured } from "./subscribe";

const PREAPPROVAL_TOPIC = "subscription_preapproval";
const AUTHORIZED_PAYMENT_TOPIC = "subscription_authorized_payment";
const ACKNOWLEDGED = { ok: true } as const;

export type MercadoPagoWebhookInput = {
  signature: string | undefined;
  providerRequestId: string | undefined;
  dataId: string | undefined;
  topic: string | undefined;
};

export async function handleMercadoPagoWebhook(
  env: Env,
  input: MercadoPagoWebhookInput,
  requestId: string,
) {
  if (!isBillingConfigured(env)) throw new AppError(503, "BILLING_UNAVAILABLE");
  const dataId = await verifyMercadoPagoSignature({
    signature: input.signature,
    requestId: input.providerRequestId,
    dataId: input.dataId,
    secret: env.MP_WEBHOOK_SECRET,
  });

  if (input.topic === PREAPPROVAL_TOPIC) {
    await applyPreapproval(env, dataId, requestId);
  } else if (input.topic === AUTHORIZED_PAYMENT_TOPIC) {
    const { preapprovalId } = await getAuthorizedPayment(env, dataId);
    await applyPreapproval(env, preapprovalId, requestId);
  }
  return ACKNOWLEDGED;
}
