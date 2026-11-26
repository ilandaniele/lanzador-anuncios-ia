import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { createUser, expectError } from "../../helpers/factory";
import { subscriptions } from "../../../src/db/schema/billing";
import {
  mercadoPagoCancel,
  mercadoPagoCancelFails,
  mercadoPagoCreate,
  mercadoPagoServerError,
  MP_INIT_POINT,
  preapprovalFixture,
} from "../../helpers/msw/mercadopago";
import { server } from "../../helpers/msw/server";
import { blockedLimiter, ORIGIN } from "../pipeline/helpers";
import {
  addSubscription,
  auditActions,
  callApi,
  db,
  expiredTrial,
  seedWorkspace,
  subscriptionRows,
} from "./helpers";

const app = createApp();
let createdProviderId = "";

type Caller = NonNullable<Parameters<typeof callApi>[2]>;

const subscribe = (
  workspaceId: string,
  as: Caller["as"],
  body: unknown = { planId: "starter" },
  env: Caller["env"] = {},
) =>
  callApi(app, `/api/w/${workspaceId}/billing/subscribe`, {
    as,
    method: "POST",
    body,
    env,
  });

function captureCreate(overrides: { initPoint?: string } = {}) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    mercadoPagoCreate((body) => {
      createdProviderId = `mp-${crypto.randomUUID()}`;
      bodies.push(body);
      return preapprovalFixture({
        id: createdProviderId,
        externalReference: String(body.external_reference),
        ...overrides,
      });
    }),
  );
  return bodies;
}

describe("POST /api/w/:wid/billing/subscribe", () => {
  it.each([
    ["starter", 30000, "Lanzador Starter"],
    ["pro", 80000, "Lanzador Pro"],
  ])(
    "creates a %s preapproval and answers its init point",
    async (planId, amount, reason) => {
      const { workspace, owner } = await seedWorkspace({ planId: "starter" });
      const bodies = captureCreate();

      const response = await subscribe(workspace.id, owner, { planId });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ initPoint: MP_INIT_POINT });
      const [row] = await subscriptionRows(workspace.id);
      expect(bodies).toEqual([
        {
          reason,
          external_reference: row!.id,
          payer_email: owner.email,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: amount,
            currency_id: "ARS",
          },
          back_url: `${ORIGIN}/w/${workspace.id}/ajustes/facturacion`,
          status: "pending",
        },
      ]);
    },
  );

  it("stores a pending row and audits the creation", async () => {
    const { workspace, owner } = await seedWorkspace({ planId: "starter" });
    captureCreate();

    await subscribe(workspace.id, owner, { planId: "pro" });

    expect(await subscriptionRows(workspace.id)).toMatchObject([
      {
        planId: "pro",
        providerSubscriptionId: createdProviderId,
        status: "pending",
        amountMinor: 8000000,
        currency: "ARS",
        paidUntil: null,
        createdBy: owner.id,
      },
    ]);
    expect(
      await auditActions(workspace.id, "billing.subscription.create"),
    ).toMatchObject([
      {
        actorUserId: owner.id,
        actorType: "user",
        origin: "manual",
        objectType: "subscription",
        detail: JSON.stringify({ planId: "pro" }),
      },
    ]);
  });

  it("works while the workspace is blocked", async () => {
    const { workspace, owner } = await seedWorkspace(expiredTrial());
    captureCreate();

    const response = await subscribe(workspace.id, owner);

    expect(response.status).toBe(201);
  });

  it.each([{ planId: "beta" }, { planId: "enterprise" }, {}, { planId: 1 }])(
    "answers 400 to %j",
    async (body) => {
      const { workspace, owner } = await seedWorkspace();

      await expectError(
        await subscribe(workspace.id, owner, body),
        400,
        "VALIDATION",
      );
    },
  );

  it("answers 409 when a subscription is already authorized", async () => {
    const { workspace, owner } = await seedWorkspace(expiredTrial());
    await addSubscription(workspace.id, { status: "authorized" });
    const bodies = captureCreate();

    await expectError(
      await subscribe(workspace.id, owner),
      409,
      "SUBSCRIPTION_ACTIVE",
    );
    expect(bodies).toEqual([]);
  });

  it("answers 403 to a non-owner", async () => {
    const admin = await createUser();
    const { workspace } = await seedWorkspace(
      {},
      { members: [{ user: admin, role: "admin" }] },
    );

    await expectError(
      await subscribe(workspace.id, admin),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("answers 401 without a session", async () => {
    const { workspace } = await seedWorkspace();

    await expectError(
      await subscribe(workspace.id, undefined),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("answers 404 to the owner of another workspace", async () => {
    const { owner } = await seedWorkspace();
    const { workspace: foreign } = await seedWorkspace();
    const bodies = captureCreate();

    await expectError(await subscribe(foreign.id, owner), 404, "NOT_FOUND");
    expect(bodies).toEqual([]);
  });

  it("answers 429 when the expensive limiter blocks", async () => {
    const { workspace, owner } = await seedWorkspace();

    await expectError(
      await subscribe(workspace.id, owner, undefined, {
        RL_EXP: blockedLimiter,
      }),
      429,
      "RATE_LIMITED",
    );
  });

  it.each(["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"] as const)(
    "answers 503 when %s is missing",
    async (name) => {
      const { workspace, owner } = await seedWorkspace();
      const bodies = captureCreate();

      await expectError(
        await subscribe(workspace.id, owner, undefined, { [name]: undefined }),
        503,
        "BILLING_UNAVAILABLE",
      );
      expect(bodies).toEqual([]);
    },
  );

  it("answers 503 and stores nothing when Mercado Pago fails", async () => {
    const { workspace, owner } = await seedWorkspace();
    server.use(mercadoPagoServerError());

    await expectError(
      await subscribe(workspace.id, owner),
      503,
      "BILLING_UNAVAILABLE",
    );
    expect(await subscriptionRows(workspace.id)).toEqual([]);
  });

  it("refuses an init point on a foreign host", async () => {
    const { workspace, owner } = await seedWorkspace();
    captureCreate({ initPoint: "https://evil.example.com/checkout" });

    await expectError(
      await subscribe(workspace.id, owner),
      503,
      "BILLING_UNAVAILABLE",
    );
    expect(await subscriptionRows(workspace.id)).toEqual([]);
  });

  it("refuses a look-alike host and a plain http init point", async () => {
    const { workspace, owner } = await seedWorkspace();
    captureCreate({ initPoint: "https://mercadopago.com.evil.test/x" });
    await expectError(
      await subscribe(workspace.id, owner),
      503,
      "BILLING_UNAVAILABLE",
    );

    server.resetHandlers();
    captureCreate({ initPoint: "http://www.mercadopago.com.ar/x" });
    await expectError(
      await subscribe(workspace.id, owner),
      503,
      "BILLING_UNAVAILABLE",
    );
  });

  describe("existing open subscriptions", () => {
    afterEach(() => {
      server.events.removeAllListeners();
    });

    const cancelledAtMp = () => {
      const paths: string[] = [];
      server.events.on("request:start", ({ request }) => {
        if (request.method === "PUT") {
          paths.push(new URL(request.url).pathname);
        }
      });
      return paths;
    };

    it("answers 409 when a subscription is paused", async () => {
      const { workspace, owner } = await seedWorkspace(expiredTrial());
      await addSubscription(workspace.id, { status: "paused" });
      const bodies = captureCreate();

      await expectError(
        await subscribe(workspace.id, owner),
        409,
        "SUBSCRIPTION_ACTIVE",
      );
      expect(bodies).toEqual([]);
    });

    it("cancels a pending preapproval at Mercado Pago before creating the new one", async () => {
      const { workspace, owner } = await seedWorkspace(expiredTrial());
      const stale = await addSubscription(workspace.id, {
        status: "pending",
        planId: "pro",
      });
      server.use(
        mercadoPagoCancel(
          preapprovalFixture({ id: stale.providerSubscriptionId! }),
        ),
      );
      const cancelled = cancelledAtMp();
      captureCreate();

      const response = await subscribe(workspace.id, owner, {
        planId: "starter",
      });

      expect(response.status).toBe(201);
      expect(cancelled).toEqual([
        `/preapproval/${stale.providerSubscriptionId}`,
      ]);
      const rows = await subscriptionRows(workspace.id);
      expect(rows.find((row) => row.id === stale.id)?.status).toBe("cancelled");
      expect(rows.filter((row) => row.status === "pending")).toMatchObject([
        { planId: "starter", providerSubscriptionId: createdProviderId },
      ]);
    });

    it("skips Mercado Pago for a pending row that never got a provider id", async () => {
      const { workspace, owner } = await seedWorkspace(expiredTrial());
      const orphan = await addSubscription(workspace.id, {
        status: "pending",
        providerSubscriptionId: null,
      });
      const cancelled = cancelledAtMp();
      captureCreate();

      const response = await subscribe(workspace.id, owner);

      expect(response.status).toBe(201);
      expect(cancelled).toEqual([]);
      const rows = await subscriptionRows(workspace.id);
      expect(rows.find((row) => row.id === orphan.id)?.status).toBe(
        "cancelled",
      );
    });

    it("answers 503 and keeps the pending row when its cancellation fails", async () => {
      const { workspace, owner } = await seedWorkspace(expiredTrial());
      const stale = await addSubscription(workspace.id, { status: "pending" });
      server.use(
        mercadoPagoCancelFails(
          preapprovalFixture({ id: stale.providerSubscriptionId! }),
        ),
      );
      const bodies = captureCreate();

      await expectError(
        await subscribe(workspace.id, owner),
        503,
        "BILLING_UNAVAILABLE",
      );
      expect(bodies).toEqual([]);
      expect(await subscriptionRows(workspace.id)).toMatchObject([
        { id: stale.id, status: "pending" },
      ]);
    });

    it("answers 409 when a concurrent request opened a subscription first", async () => {
      const { workspace, owner } = await seedWorkspace(expiredTrial());
      const stale = await addSubscription(workspace.id, { status: "pending" });
      server.use(
        mercadoPagoCancel(
          preapprovalFixture({ id: stale.providerSubscriptionId! }),
          {},
          async () => {
            await db
              .update(subscriptions)
              .set({ status: "cancelled" })
              .where(eq(subscriptions.id, stale.id));
            await addSubscription(workspace.id, { status: "pending" });
          },
        ),
      );
      const bodies = captureCreate();

      await expectError(
        await subscribe(workspace.id, owner),
        409,
        "SUBSCRIPTION_ACTIVE",
      );
      expect(bodies).toEqual([]);
      expect(
        (await subscriptionRows(workspace.id)).filter(
          (row) => row.status === "pending",
        ),
      ).toHaveLength(1);
    });
  });

  it("stores the row before calling Mercado Pago and uses its id as external reference", async () => {
    const { workspace, owner } = await seedWorkspace();
    let rowsDuringCall: Awaited<ReturnType<typeof subscriptionRows>> = [];
    server.use(
      mercadoPagoCreate(async (body) => {
        rowsDuringCall = await subscriptionRows(workspace.id);
        createdProviderId = `mp-${crypto.randomUUID()}`;
        return preapprovalFixture({
          id: createdProviderId,
          externalReference: String(body.external_reference),
        });
      }),
    );

    await subscribe(workspace.id, owner);

    expect(rowsDuringCall).toMatchObject([
      { status: "pending", providerSubscriptionId: null },
    ]);
    const [row] = await subscriptionRows(workspace.id);
    expect(row).toMatchObject({
      id: rowsDuringCall[0]!.id,
      providerSubscriptionId: createdProviderId,
    });
  });

  it("refuses a second open subscription for a workspace at the database", async () => {
    const { workspace } = await seedWorkspace();
    await addSubscription(workspace.id, { status: "pending" });

    await expect(
      addSubscription(workspace.id, { status: "authorized" }),
    ).rejects.toThrow();
    await expect(
      addSubscription(workspace.id, { status: "paused" }),
    ).rejects.toThrow();
    await addSubscription(workspace.id, { status: "cancelled" });
    await addSubscription(workspace.id, { status: "cancelled" });
  });
});
