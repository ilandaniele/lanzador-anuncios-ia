import type { z } from "zod";
import type { SubscriptionStatus } from "../../../shared/billing";
import type { Env } from "../../env";
import { AppError } from "../../lib/errors";
import { addCalendarMonth } from "../../lib/time";
import {
  authorizedPaymentResponseSchema,
  type PreapprovalSummary,
  preapprovalResponseSchema,
} from "./schemas";

const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";
const MP_AUTHORIZED_PAYMENT_URL =
  "https://api.mercadopago.com/authorized_payments";
const TIMEOUT_MS = 10_000;

type MercadoPagoEnv = Pick<Env, "MP_ACCESS_TOKEN">;

export interface Preapproval {
  id: string;
  status: SubscriptionStatus;
  externalReference: string;
  amountMinor: number;
  currency: string;
  paidUntil: number | null;
  initPoint: string;
}

export interface CreatePreapprovalInput {
  reason: string;
  amountMinor: number;
  currency: "ARS";
  backUrl: string;
  payerEmail: string;
  externalReference: string;
}

const unavailable = (providerStatus: number | null) =>
  new AppError(503, "BILLING_UNAVAILABLE", {
    message: `Mercado Pago request failed (status ${providerStatus ?? "none"})`,
  });

const paidUntilOf = (summarized: PreapprovalSummary | null | undefined) => {
  const { charged_quantity: charges, last_charged_date: lastCharge } =
    summarized ?? {};
  return charges && charges > 0 && lastCharge
    ? addCalendarMonth(Date.parse(lastCharge))
    : null;
};

async function requestProvider<Schema extends z.ZodType>(
  env: MercadoPagoEnv,
  url: string,
  method: "POST" | "GET" | "PUT",
  schema: Schema,
  body?: unknown,
): Promise<z.output<Schema>> {
  if (!env.MP_ACCESS_TOKEN) throw unavailable(null);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unavailable(null);
  }
  if (!response.ok) throw unavailable(response.status);

  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data;
}

async function requestPreapproval(
  env: MercadoPagoEnv,
  url: string,
  method: "POST" | "GET" | "PUT",
  body?: unknown,
): Promise<Preapproval> {
  const data = await requestProvider(
    env,
    url,
    method,
    preapprovalResponseSchema,
    body,
  );
  const { auto_recurring: recurring } = data;
  return {
    id: data.id,
    status: data.status,
    externalReference: data.external_reference,
    amountMinor: Math.round(recurring.transaction_amount * 100),
    currency: recurring.currency_id,
    paidUntil: paidUntilOf(data.summarized),
    initPoint: data.init_point,
  };
}

const preapprovalUrl = (id: string) =>
  `${MP_PREAPPROVAL_URL}/${encodeURIComponent(id)}`;

export const createPreapproval = (
  env: MercadoPagoEnv,
  input: CreatePreapprovalInput,
) =>
  requestPreapproval(env, MP_PREAPPROVAL_URL, "POST", {
    reason: input.reason,
    external_reference: input.externalReference,
    payer_email: input.payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: input.amountMinor / 100,
      currency_id: input.currency,
    },
    back_url: input.backUrl,
    status: "pending",
  });

export const getPreapproval = (env: MercadoPagoEnv, id: string) =>
  requestPreapproval(env, preapprovalUrl(id), "GET");

export const cancelPreapproval = (env: MercadoPagoEnv, id: string) =>
  requestPreapproval(env, preapprovalUrl(id), "PUT", { status: "cancelled" });

export const getAuthorizedPayment = async (env: MercadoPagoEnv, id: string) => {
  const { preapproval_id: preapprovalId } = await requestProvider(
    env,
    `${MP_AUTHORIZED_PAYMENT_URL}/${encodeURIComponent(id)}`,
    "GET",
    authorizedPaymentResponseSchema,
  );
  return { preapprovalId };
};
