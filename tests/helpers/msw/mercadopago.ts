import { http, HttpResponse } from "msw";

export const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";

export const MP_AUTHORIZED_PAYMENT_URL =
  "https://api.mercadopago.com/authorized_payments";

export const MP_INIT_POINT =
  "https://www.mercadopago.com.ar/subscriptions/checkout";

export interface PreapprovalFixtureOverrides {
  id?: string;
  status?: string;
  externalReference?: string;
  amount?: number;
  currency?: string;
  nextPaymentDate?: string | null;
  chargedQuantity?: number;
  lastChargedDate?: string | null;
  initPoint?: string;
}

export const preapprovalFixture = ({
  id = "mp-preapproval-1",
  status = "pending",
  externalReference = "workspace-id",
  amount = 30000,
  currency = "ARS",
  nextPaymentDate = null,
  chargedQuantity = 0,
  lastChargedDate = null,
  initPoint = MP_INIT_POINT,
}: PreapprovalFixtureOverrides = {}) => ({
  id,
  status,
  external_reference: externalReference,
  init_point: initPoint,
  next_payment_date: nextPaymentDate,
  auto_recurring: { transaction_amount: amount, currency_id: currency },
  summarized: {
    charged_quantity: chargedQuantity,
    last_charged_date: lastChargedDate,
  },
});

type Fixture = ReturnType<typeof preapprovalFixture>;

interface HandlerOptions {
  once?: boolean;
  pathId?: string;
}

export const mercadoPagoCreate = (
  respond: (body: Record<string, unknown>) => Fixture | Promise<Fixture>,
  options: HandlerOptions = {},
) =>
  http.post(
    MP_PREAPPROVAL_URL,
    async ({ request }) =>
      HttpResponse.json(
        await respond((await request.json()) as Record<string, unknown>),
        { status: 201 },
      ),
    options,
  );

const preapprovalPath = (fixture: Fixture, { pathId }: HandlerOptions) =>
  `${MP_PREAPPROVAL_URL}/${encodeURIComponent(pathId ?? fixture.id)}`;

export const mercadoPagoGet = (
  fixture: Fixture,
  options: HandlerOptions = {},
) =>
  http.get(
    preapprovalPath(fixture, options),
    () => HttpResponse.json(fixture),
    { once: options.once },
  );

export const mercadoPagoCancel = (
  fixture: Fixture,
  options: HandlerOptions = {},
  onCancel: () => Promise<void> | void = () => undefined,
) =>
  http.put(
    preapprovalPath(fixture, options),
    async () => {
      await onCancel();
      return HttpResponse.json({ ...fixture, status: "cancelled" });
    },
    { once: options.once },
  );

export const mercadoPagoCancelFails = (
  fixture: Fixture,
  options: HandlerOptions = {},
) =>
  http.put(
    preapprovalPath(fixture, options),
    () => HttpResponse.json({ message: "failure" }, { status: 500 }),
    { once: options.once },
  );

export const mercadoPagoServerError = (options: HandlerOptions = {}) =>
  http.all(
    `${MP_PREAPPROVAL_URL}*`,
    () => HttpResponse.json({ message: "failure" }, { status: 500 }),
    options,
  );

export const mercadoPagoAuthorizedPayment = (
  id: string,
  preapprovalId: string,
) =>
  http.get(`${MP_AUTHORIZED_PAYMENT_URL}/${encodeURIComponent(id)}`, () =>
    HttpResponse.json({
      id,
      preapproval_id: preapprovalId,
      status: "approved",
    }),
  );
