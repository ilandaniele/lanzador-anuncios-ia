import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { errorEvents } from "../../../src/db/schema/ops";
import { workspaces } from "../../../src/db/schema/workspaces";
import { readEnvelope, testEnv } from "../pipeline/helpers";
import {
  mercadoPagoAuthorizedPayment,
  mercadoPagoCancel,
  mercadoPagoCancelFails,
  mercadoPagoGet,
  mercadoPagoServerError,
  preapprovalFixture,
  type PreapprovalFixtureOverrides,
} from "../../helpers/msw/mercadopago";
import { server } from "../../helpers/msw/server";
import {
  signMercadoPagoWebhook,
  type SignedWebhook,
} from "../../helpers/mercadopago-signature";
import {
  addSubscription,
  auditActions,
  db,
  DAY,
  expiredTrial,
  seedWorkspace,
  subscriptionRows,
  workspaceRow,
} from "./helpers";

const app = createApp();
const WEBHOOK_PATH = "/api/billing/mercadopago/webhook";
const PREAPPROVAL_TOPIC = "subscription_preapproval";
const PAYMENT_TOPIC = "subscription_authorized_payment";

type Delivery = {
  query?: string;
  headers?: Record<string, string>;
  env?: Parameters<typeof testEnv>[0];
};

const deliver = ({ query, headers, env }: Delivery) =>
  app.request(
    `${WEBHOOK_PATH}?${query}`,
    { method: "POST", headers, body: JSON.stringify({ data: { id: "x" } }) },
    testEnv(env),
  );

async function deliverSigned(
  dataId: string,
  {
    topic = PREAPPROVAL_TOPIC,
    ...signing
  }: Partial<SignedWebhook> & { topic?: string } = {},
) {
  const headers = await signMercadoPagoWebhook({ dataId, ...signing });
  return deliver({
    query: `data.id=${dataId}&type=${topic}`,
    headers,
  });
}

function captureMpRequests() {
  const urls: string[] = [];
  server.events.on("request:start", ({ request }) => {
    urls.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return urls;
}

const NEXT_PAYMENT = "2030-01-15T12:00:00.000-03:00";
const LAST_CHARGE = "2030-01-15T12:00:00.000-03:00";
const LAST_CHARGE_PLUS_MONTH = Date.parse("2030-02-15T15:00:00.000Z");
const MINUTE = 60 * 1000;

async function seedPendingSubscription(
  overrides: Parameters<typeof addSubscription>[1] = {},
) {
  const { workspace } = await seedWorkspace(expiredTrial());
  const row = await addSubscription(workspace.id, {
    status: "pending",
    providerSubscriptionId: `mp-${crypto.randomUUID()}`,
    ...overrides,
  });
  return { workspace, row };
}

type SeededRow = Awaited<ReturnType<typeof seedPendingSubscription>>["row"];

const mockPreapproval = (
  row: SeededRow,
  overrides: PreapprovalFixtureOverrides = {},
  providerId = row.providerSubscriptionId!,
) =>
  server.use(
    mercadoPagoGet(
      preapprovalFixture({
        id: providerId,
        externalReference: row.id,
        ...overrides,
      }),
    ),
  );

const unchanged = async (
  workspaceId: string,
  planId: string,
  status: string,
) => {
  expect(await subscriptionRows(workspaceId)).toMatchObject([
    { status, paidUntil: null },
  ]);
  expect((await workspaceRow(workspaceId)).planId).toBe(planId);
  expect(
    await auditActions(workspaceId, "billing.subscription.update"),
  ).toEqual([]);
};

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/billing/mercadopago/webhook", () => {
  it("authorizes the row, sets paidUntil from the charge, the plan and audits", async () => {
    const { workspace, row } = await seedPendingSubscription({
      planId: "pro",
      amountMinor: 8000000,
    });
    mockPreapproval(row, {
      status: "authorized",
      amount: 80000,
      chargedQuantity: 1,
      lastChargedDate: LAST_CHARGE,
    });

    const response = await deliverSigned(row.providerSubscriptionId!);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      {
        status: "authorized",
        paidUntil: LAST_CHARGE_PLUS_MONTH,
        authorizedAt: expect.any(Number),
      },
    ]);
    expect((await workspaceRow(workspace.id)).planId).toBe("pro");
    expect(
      await auditActions(workspace.id, "billing.subscription.update"),
    ).toMatchObject([
      {
        actorUserId: null,
        actorType: "system",
        origin: "system",
        objectType: "subscription",
        detail: JSON.stringify({ planId: "pro", status: "authorized" }),
      },
    ]);
  });

  it("never derives paidUntil from next_payment_date", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, {
      status: "authorized",
      nextPaymentDate: NEXT_PAYMENT,
    });

    await deliverSigned(row.providerSubscriptionId!);

    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized", paidUntil: null },
    ]);
  });

  it("keeps paidUntil null when nothing was charged yet", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, {
      status: "authorized",
      chargedQuantity: 0,
      lastChargedDate: LAST_CHARGE,
    });

    await deliverSigned(row.providerSubscriptionId!);

    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized", paidUntil: null },
    ]);
  });

  it("clamps the paid month to the end of a short month", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, {
      status: "authorized",
      chargedQuantity: 3,
      lastChargedDate: "2030-01-31T00:00:00.000Z",
    });

    await deliverSigned(row.providerSubscriptionId!);

    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { paidUntil: Date.parse("2030-02-28T00:00:00.000Z") },
    ]);
  });

  it("sets authorizedAt once and keeps it on later updates", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, { status: "authorized" });
    await deliverSigned(row.providerSubscriptionId!);
    const [first] = await subscriptionRows(workspace.id);
    server.resetHandlers();
    mockPreapproval(row, {
      status: "authorized",
      chargedQuantity: 1,
      lastChargedDate: LAST_CHARGE,
    });

    await deliverSigned(row.providerSubscriptionId!);

    const [second] = await subscriptionRows(workspace.id);
    expect(first!.authorizedAt).toEqual(expect.any(Number));
    expect(second!.authorizedAt).toBe(first!.authorizedAt);
    expect(second!.paidUntil).toBe(LAST_CHARGE_PLUS_MONTH);
  });

  it("is idempotent: the same delivery twice audits once", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, {
      status: "authorized",
      chargedQuantity: 1,
      lastChargedDate: LAST_CHARGE,
    });

    const first = await deliverSigned(row.providerSubscriptionId!);
    const second = await deliverSigned(row.providerSubscriptionId!);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(
      await auditActions(workspace.id, "billing.subscription.update"),
    ).toHaveLength(1);
  });

  it("looks the row up by external reference and stores a missing provider id", async () => {
    const { workspace, row } = await seedPendingSubscription({
      providerSubscriptionId: null,
    });
    mockPreapproval(row, { status: "authorized" }, "mp-assigned-1");

    const response = await deliverSigned("mp-assigned-1");

    expect(response.status).toBe(200);
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized", providerSubscriptionId: "mp-assigned-1" },
    ]);
  });

  it("ignores a preapproval whose id differs from the stored one", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, { status: "authorized" }, "mp-another-preapproval");

    const response = await deliverSigned("mp-another-preapproval");

    expect(response.status).toBe(200);
    await unchanged(workspace.id, "starter", "pending");
  });

  it("verifies with the lowercased id but fetches with the original one", async () => {
    const providerId = "mpabc123def";
    const { workspace, row } = await seedPendingSubscription({
      providerSubscriptionId: providerId,
    });
    server.use(
      mercadoPagoGet(
        preapprovalFixture({
          id: providerId,
          externalReference: row.id,
          status: "authorized",
        }),
        { pathId: providerId.toUpperCase() },
      ),
    );
    const requests = captureMpRequests();
    const headers = await signMercadoPagoWebhook({ dataId: providerId });

    const response = await deliver({
      query: `data.id=${providerId.toUpperCase()}&type=${PREAPPROVAL_TOPIC}`,
      headers,
    });

    expect(response.status).toBe(200);
    expect(requests).toEqual([`GET /preapproval/${providerId.toUpperCase()}`]);
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized" },
    ]);
  });

  it("marks a cancelled preapproval and keeps paidUntil", async () => {
    const paidUntil = Date.now() + DAY;
    const { workspace, row } = await seedPendingSubscription({
      status: "authorized",
      paidUntil,
    });
    mockPreapproval(row, {
      status: "cancelled",
      nextPaymentDate: NEXT_PAYMENT,
    });

    const response = await deliverSigned(row.providerSubscriptionId!);

    expect(response.status).toBe(200);
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "cancelled", paidUntil },
    ]);
  });

  it("records the paid month of a preapproval cancelled after a charge", async () => {
    const { workspace, row } = await seedPendingSubscription({
      status: "authorized",
    });
    mockPreapproval(row, {
      status: "cancelled",
      chargedQuantity: 1,
      lastChargedDate: LAST_CHARGE,
    });

    await deliverSigned(row.providerSubscriptionId!);

    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "cancelled", paidUntil: LAST_CHARGE_PLUS_MONTH },
    ]);
  });

  it("keeps paidUntil null for a pending preapproval", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, {
      status: "pending",
      nextPaymentDate: NEXT_PAYMENT,
    });

    await deliverSigned(row.providerSubscriptionId!);

    await unchanged(workspace.id, "starter", "pending");
  });

  it.each([
    ["amount", { amount: 1 }],
    ["currency", { currency: "USD" }],
    ["external reference", { externalReference: "another-subscription" }],
  ] as const)("ignores a %s mismatch with 200", async (_label, mismatch) => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, { status: "authorized", ...mismatch });

    const response = await deliverSigned(row.providerSubscriptionId!);

    expect(response.status).toBe(200);
    await unchanged(workspace.id, "starter", "pending");
  });

  it("ignores a preapproval pointing at another workspace's row", async () => {
    const { workspace, row } = await seedPendingSubscription();
    const { workspace: foreign, row: foreignRow } =
      await seedPendingSubscription();
    mockPreapproval(
      foreignRow,
      { status: "authorized" },
      row.providerSubscriptionId!,
    );

    const response = await deliverSigned(row.providerSubscriptionId!);

    expect(response.status).toBe(200);
    await unchanged(workspace.id, "starter", "pending");
    await unchanged(foreign.id, "starter", "pending");
  });

  it("ignores an unknown preapproval with 200", async () => {
    server.use(
      mercadoPagoGet(
        preapprovalFixture({
          id: "mp-unknown",
          externalReference: "no-such-row",
          status: "authorized",
        }),
      ),
    );

    const response = await deliverSigned("mp-unknown");

    expect(response.status).toBe(200);
  });

  it("ignores another topic without calling Mercado Pago", async () => {
    const { workspace, row } = await seedPendingSubscription();
    const requests = captureMpRequests();

    const response = await deliverSigned(row.providerSubscriptionId!, {
      topic: "payment",
    });

    expect(response.status).toBe(200);
    expect(requests).toEqual([]);
    await unchanged(workspace.id, "starter", "pending");
  });

  it("reads the legacy topic query parameter", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, { status: "authorized" });
    const headers = await signMercadoPagoWebhook({
      dataId: row.providerSubscriptionId!,
    });

    const response = await deliver({
      query: `data.id=${row.providerSubscriptionId}&topic=${PREAPPROVAL_TOPIC}`,
      headers,
    });

    expect(response.status).toBe(200);
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized" },
    ]);
  });

  it("answers 503 when Mercado Pago fails so it retries", async () => {
    const { workspace, row } = await seedPendingSubscription();
    server.use(mercadoPagoServerError());

    const response = await deliverSigned(row.providerSubscriptionId!);

    expect(response.status).toBe(503);
    expect((await readEnvelope(response)).code).toBe("BILLING_UNAVAILABLE");
    await unchanged(workspace.id, "starter", "pending");
  });

  it("hides the provider status from the client and logs it with the request id", async () => {
    const { row } = await seedPendingSubscription();
    server.use(mercadoPagoServerError());

    const response = await deliverSigned(row.providerSubscriptionId!);

    const raw = await response.clone().text();
    expect(raw).not.toContain("providerStatus");
    const { requestId } = await readEnvelope(response);
    const [event] = await db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.requestId, requestId));
    expect(event?.message).toContain("500");
  });

  it("answers 503 and changes nothing when a date is malformed", async () => {
    const { workspace, row } = await seedPendingSubscription();
    mockPreapproval(row, {
      status: "authorized",
      chargedQuantity: 1,
      lastChargedDate: "not-a-date",
    });

    const response = await deliverSigned(row.providerSubscriptionId!);

    expect(response.status).toBe(503);
    await unchanged(workspace.id, "starter", "pending");
  });

  describe("plan recomputation", () => {
    const setWorkspacePlan = (workspaceId: string, planId: string) =>
      db
        .update(workspaces)
        .set({ planId, trialEndsAt: null })
        .where(eq(workspaces.id, workspaceId));

    it("never leaves pro when only starter pays", async () => {
      const { workspace, row } = await seedPendingSubscription({
        planId: "starter",
      });
      await setWorkspacePlan(workspace.id, "pro");
      mockPreapproval(row, {
        status: "authorized",
        chargedQuantity: 1,
        lastChargedDate: LAST_CHARGE,
      });

      await deliverSigned(row.providerSubscriptionId!);

      expect((await workspaceRow(workspace.id)).planId).toBe("starter");
    });

    it("follows the authorized subscription over a cancelled paid one", async () => {
      const { workspace, row } = await seedPendingSubscription({
        planId: "starter",
      });
      await addSubscription(workspace.id, {
        planId: "pro",
        status: "cancelled",
        paidUntil: Date.now() + DAY,
        createdAt: Date.now() - 1000,
      });
      await setWorkspacePlan(workspace.id, "pro");
      mockPreapproval(row, {
        status: "authorized",
        chargedQuantity: 1,
        lastChargedDate: new Date().toISOString(),
      });

      await deliverSigned(row.providerSubscriptionId!);

      expect((await workspaceRow(workspace.id)).planId).toBe("starter");
    });

    it("does not escalate to an authorized plan that never paid while a paid one remains", async () => {
      const { workspace, row } = await seedPendingSubscription({
        planId: "pro",
        amountMinor: 8000000,
      });
      await addSubscription(workspace.id, {
        planId: "starter",
        status: "cancelled",
        paidUntil: Date.now() + 20 * DAY,
        authorizedAt: Date.now() - 10 * DAY,
        createdAt: Date.now() - 1000,
      });
      await setWorkspacePlan(workspace.id, "starter");
      mockPreapproval(row, { status: "authorized", amount: 80000 });

      await deliverSigned(row.providerSubscriptionId!);

      expect(await subscriptionRows(workspace.id)).toContainEqual(
        expect.objectContaining({ planId: "pro", status: "authorized" }),
      );
      expect((await workspaceRow(workspace.id)).planId).toBe("starter");
    });

    it("grants an unpaid authorized plan only once per workspace", async () => {
      const { workspace, row } = await seedPendingSubscription({
        planId: "pro",
        amountMinor: 8000000,
      });
      await addSubscription(workspace.id, {
        planId: "starter",
        status: "cancelled",
        authorizedAt: Date.now() - 10 * DAY,
        createdAt: Date.now() - 1000,
      });
      await setWorkspacePlan(workspace.id, "starter");
      mockPreapproval(row, { status: "authorized", amount: 80000 });

      await deliverSigned(row.providerSubscriptionId!);

      expect((await workspaceRow(workspace.id)).planId).toBe("starter");
    });

    it("keeps the plan of a cancelled subscription that is still paid", async () => {
      const { workspace, row } = await seedPendingSubscription({
        planId: "pro",
        status: "authorized",
        amountMinor: 8000000,
      });
      await setWorkspacePlan(workspace.id, "starter");
      mockPreapproval(row, {
        status: "cancelled",
        amount: 80000,
        chargedQuantity: 1,
        lastChargedDate: new Date(Date.now() - DAY).toISOString(),
      });

      await deliverSigned(row.providerSubscriptionId!);

      expect((await workspaceRow(workspace.id)).planId).toBe("pro");
    });

    it("does not touch the plan of a beta workspace", async () => {
      const { workspace, row } = await seedPendingSubscription({
        planId: "pro",
        amountMinor: 8000000,
      });
      await setWorkspacePlan(workspace.id, "beta");
      mockPreapproval(row, { status: "authorized", amount: 80000 });

      await deliverSigned(row.providerSubscriptionId!);

      expect((await workspaceRow(workspace.id)).planId).toBe("beta");
    });
  });

  describe("signature", () => {
    const id = "mp-signed-1";
    const validHeaders = () => signMercadoPagoWebhook({ dataId: id });
    const query = `data.id=${id}&type=${PREAPPROVAL_TOPIC}`;

    const expectBadSignature = async (response: Response) => {
      expect(response.status).toBe(400);
      expect((await readEnvelope(response)).code).toBe("BAD_SIGNATURE");
    };

    it("rejects a request without x-signature", async () => {
      const { "x-request-id": requestId } = await validHeaders();

      await expectBadSignature(
        await deliver({ query, headers: { "x-request-id": requestId } }),
      );
    });

    it.each(["garbage", "ts=1700000000", "v1=abcd", "ts=,v1="])(
      "rejects the garbled header %j",
      async (header) => {
        await expectBadSignature(
          await deliver({
            query,
            headers: { "x-signature": header, "x-request-id": "mp-request-1" },
          }),
        );
      },
    );

    it("rejects a wrong v1", async () => {
      const headers = await validHeaders();

      await expectBadSignature(
        await deliver({
          query,
          headers: {
            ...headers,
            "x-signature": `ts=${Date.now()},v1=` + "0".repeat(64),
          },
        }),
      );
    });

    it("rejects a signature made with another secret", async () => {
      const headers = await signMercadoPagoWebhook({
        dataId: id,
        secret: "other",
      });

      await expectBadSignature(await deliver({ query, headers }));
    });

    it("rejects a signature made for another data id", async () => {
      const headers = await signMercadoPagoWebhook({
        dataId: id,
        manifestDataId: "mp-other",
      });

      await expectBadSignature(await deliver({ query, headers }));
    });

    it("rejects a missing x-request-id", async () => {
      const { "x-signature": signature } = await validHeaders();

      await expectBadSignature(
        await deliver({ query, headers: { "x-signature": signature } }),
      );
    });

    it.each([
      "",
      "data.id=bad%20id!&type=" + PREAPPROVAL_TOPIC,
      `type=${PREAPPROVAL_TOPIC}`,
    ])("rejects the data id query %j", async (badQuery) => {
      const headers = await validHeaders();

      await expectBadSignature(await deliver({ query: badQuery, headers }));
    });

    describe("timestamp window", () => {
      const withTs = async (ts: string) =>
        deliver({
          query,
          headers: await signMercadoPagoWebhook({ dataId: id, ts }),
        });

      it.each([
        ["older than 10 minutes", () => String(Date.now() - 11 * MINUTE)],
        ["more than 5 minutes ahead", () => String(Date.now() + 6 * MINUTE)],
        [
          "in seconds and older than 10 minutes",
          () => String(Math.floor((Date.now() - 11 * MINUTE) / 1000)),
        ],
        ["not numeric", () => "yesterday"],
      ])("rejects a ts that is %s", async (_label, ts) => {
        await expectBadSignature(await withTs(ts()));
      });

      it.each([
        ["in milliseconds", () => String(Date.now() - 9 * MINUTE)],
        ["in seconds", () => String(Math.floor(Date.now() / 1000))],
        ["slightly ahead", () => String(Date.now() + 4 * MINUTE)],
      ])("accepts a ts %s", async (_label, ts) => {
        server.use(
          mercadoPagoGet(
            preapprovalFixture({ id, externalReference: "no-such-row" }),
          ),
        );

        const response = await withTs(ts());

        expect(response.status).toBe(200);
      });
    });

    it("never reaches Mercado Pago or the database on a bad signature", async () => {
      const { workspace, row } = await seedPendingSubscription();
      const requests = captureMpRequests();

      await deliver({
        query: `data.id=${row.providerSubscriptionId}&type=${PREAPPROVAL_TOPIC}`,
        headers: { "x-signature": "ts=1,v1=00", "x-request-id": "r" },
      });

      expect(requests).toEqual([]);
      await unchanged(workspace.id, "starter", "pending");
    });
  });

  it("is not blocked by CSRF without an Origin header", async () => {
    const response = await deliver({ query: "data.id=abc" });

    expect(response.status).not.toBe(403);
    expect((await readEnvelope(response)).code).toBe("BAD_SIGNATURE");
  });

  it.each(["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"] as const)(
    "answers 503 and never reaches Mercado Pago when %s is missing",
    async (name) => {
      const { workspace, row } = await seedPendingSubscription();
      const requests = captureMpRequests();
      const headers = await signMercadoPagoWebhook({
        dataId: row.providerSubscriptionId!,
      });

      const response = await deliver({
        query: `data.id=${row.providerSubscriptionId}&type=${PREAPPROVAL_TOPIC}`,
        headers,
        env: { [name]: undefined },
      });

      expect(response.status).toBe(503);
      expect((await readEnvelope(response)).code).toBe("BILLING_UNAVAILABLE");
      expect(requests).toEqual([]);
      await unchanged(workspace.id, "starter", "pending");
    },
  );

  it("answers 503 when the webhook secret is empty", async () => {
    const requests = captureMpRequests();
    const headers = await signMercadoPagoWebhook({ dataId: "mp-1" });

    const response = await deliver({
      query: `data.id=mp-1&type=${PREAPPROVAL_TOPIC}`,
      headers,
      env: { MP_WEBHOOK_SECRET: "" },
    });

    expect(response.status).toBe(503);
    expect(requests).toEqual([]);
  });

  describe("renewals (authorized payment topic)", () => {
    const paymentId = "ap-renewal-1";
    const deliverPayment = (overrides: Partial<SignedWebhook> = {}) =>
      deliverSigned(paymentId, { topic: PAYMENT_TOPIC, ...overrides });

    it("extends paidUntil from the preapproval of the authorized payment", async () => {
      const { workspace, row } = await seedPendingSubscription({
        status: "authorized",
        paidUntil: Date.now() - DAY / 2,
      });
      server.use(
        mercadoPagoAuthorizedPayment(paymentId, row.providerSubscriptionId!),
      );
      mockPreapproval(row, {
        status: "authorized",
        chargedQuantity: 2,
        lastChargedDate: LAST_CHARGE,
      });

      const response = await deliverPayment();

      expect(response.status).toBe(200);
      expect(await subscriptionRows(workspace.id)).toMatchObject([
        { status: "authorized", paidUntil: LAST_CHARGE_PLUS_MONTH },
      ]);
      expect(
        await auditActions(workspace.id, "billing.subscription.update"),
      ).toHaveLength(1);
    });

    it("rejects a bad signature without reaching Mercado Pago", async () => {
      const { workspace } = await seedPendingSubscription({
        status: "authorized",
      });
      const requests = captureMpRequests();

      const response = await deliverPayment({ secret: "other" });

      expect(response.status).toBe(400);
      expect((await readEnvelope(response)).code).toBe("BAD_SIGNATURE");
      expect(requests).toEqual([]);
      expect(await subscriptionRows(workspace.id)).toMatchObject([
        { status: "authorized", paidUntil: null },
      ]);
    });

    it("ignores an unknown preapproval with 200", async () => {
      server.use(
        mercadoPagoAuthorizedPayment(paymentId, "mp-unknown-renewal"),
        mercadoPagoGet(
          preapprovalFixture({
            id: "mp-unknown-renewal",
            externalReference: "no-such-row",
            status: "authorized",
          }),
        ),
      );

      const response = await deliverPayment();

      expect(response.status).toBe(200);
    });

    it("answers 503 so Mercado Pago retries when the payment lookup fails", async () => {
      server.use(
        http.get("https://api.mercadopago.com/authorized_payments/*", () =>
          HttpResponse.json({ message: "failure" }, { status: 500 }),
        ),
      );

      const response = await deliverPayment();

      expect(response.status).toBe(503);
    });
  });

  describe("cancelled rows stay cancelled", () => {
    const seedCancelled = () =>
      seedPendingSubscription({ status: "cancelled" });

    it.each(["pending", "authorized", "paused"] as const)(
      "keeps a cancelled row cancelled when Mercado Pago reports %s, records the charge and cancels at the provider",
      async (reported) => {
        const { workspace, row } = await seedCancelled();
        mockPreapproval(row, {
          status: reported,
          chargedQuantity: 1,
          lastChargedDate: LAST_CHARGE,
        });
        server.use(
          mercadoPagoCancel(
            preapprovalFixture({ id: row.providerSubscriptionId! }),
          ),
        );
        const requests = captureMpRequests();

        const response = await deliverSigned(row.providerSubscriptionId!);

        expect(response.status).toBe(200);
        expect(requests).toContain(
          `PUT /preapproval/${row.providerSubscriptionId}`,
        );
        expect(await subscriptionRows(workspace.id)).toMatchObject([
          { status: "cancelled", paidUntil: LAST_CHARGE_PLUS_MONTH },
        ]);
      },
    );

    it("still answers 200 and keeps the row cancelled when the provider cancel fails", async () => {
      const { workspace, row } = await seedCancelled();
      mockPreapproval(row, { status: "authorized" });
      server.use(
        mercadoPagoCancelFails(
          preapprovalFixture({ id: row.providerSubscriptionId! }),
        ),
      );

      const response = await deliverSigned(row.providerSubscriptionId!);

      expect(response.status).toBe(200);
      expect(await subscriptionRows(workspace.id)).toMatchObject([
        { status: "cancelled" },
      ]);
    });

    it("does not call the provider cancel when it already reports cancelled", async () => {
      const { row } = await seedCancelled();
      mockPreapproval(row, { status: "cancelled" });
      const requests = captureMpRequests();

      await deliverSigned(row.providerSubscriptionId!);

      expect(requests.filter((entry) => entry.startsWith("PUT"))).toEqual([]);
    });
  });
});
