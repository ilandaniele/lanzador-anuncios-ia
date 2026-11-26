import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { cancelOpenSubscriptions } from "../../../src/api/services/billing/cancel-open";
import { createUser, expectError } from "../../helpers/factory";
import {
  mercadoPagoCancel,
  mercadoPagoCancelFails,
  mercadoPagoGet,
  mercadoPagoServerError,
  preapprovalFixture,
} from "../../helpers/msw/mercadopago";
import { server } from "../../helpers/msw/server";
import { blockedLimiter } from "../pipeline/helpers";
import {
  addSubscription,
  auditActions,
  callApi,
  DAY,
  expiredTrial,
  seedWorkspace,
  subscriptionRows,
} from "./helpers";

const app = createApp();

type Caller = NonNullable<Parameters<typeof callApi>[2]>;

const cancel = (workspaceId: string, as: Caller["as"], env?: Caller["env"]) =>
  callApi(app, `/api/w/${workspaceId}/billing/cancel`, {
    as,
    method: "POST",
    env,
  });

function captureCancels() {
  const cancelled: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "PUT") cancelled.push(new URL(request.url).pathname);
  });
  return cancelled;
}

describe("POST /api/w/:wid/billing/cancel", () => {
  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("cancels the open row, keeps paidUntil and audits", async () => {
    const paidUntil = Date.now() + DAY;
    const { workspace, owner } = await seedWorkspace(expiredTrial());
    const authorized = await addSubscription(workspace.id, {
      status: "authorized",
      paidUntil,
    });
    const done = await addSubscription(workspace.id, { status: "cancelled" });
    server.use(
      mercadoPagoCancel(
        preapprovalFixture({ id: authorized.providerSubscriptionId! }),
      ),
    );
    const cancelled = captureCancels();

    const response = await cancel(workspace.id, owner);

    expect(response.status).toBe(204);
    expect(cancelled).toEqual([
      `/preapproval/${authorized.providerSubscriptionId}`,
    ]);
    const rows = await subscriptionRows(workspace.id);
    expect(rows.map((row) => row.status)).toEqual(["cancelled", "cancelled"]);
    expect(rows.find((row) => row.id === authorized.id)?.paidUntil).toBe(
      paidUntil,
    );
    expect(rows.find((row) => row.id === done.id)?.updatedAt).toBe(
      done.updatedAt,
    );
    expect(
      await auditActions(workspace.id, "billing.subscription.cancel"),
    ).toMatchObject([
      { actorUserId: owner.id, origin: "manual", objectType: "subscription" },
    ]);
  });

  it("answers 404 when nothing is open", async () => {
    const { workspace, owner } = await seedWorkspace();
    await addSubscription(workspace.id, { status: "cancelled" });

    await expectError(await cancel(workspace.id, owner), 404, "NOT_FOUND");
  });

  it("answers 503 and keeps the rows when Mercado Pago fails", async () => {
    const { workspace, owner } = await seedWorkspace();
    await addSubscription(workspace.id, { status: "authorized" });
    server.use(mercadoPagoServerError());

    await expectError(
      await cancel(workspace.id, owner),
      503,
      "BILLING_UNAVAILABLE",
    );
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized" },
    ]);
  });

  it("marks the rows Mercado Pago cancelled and answers 503 when another fails", async () => {
    const { workspace, owner } = await seedWorkspace();
    const succeeds = await addSubscription(workspace.id, {
      status: "cancelled",
      updatedAt: 1,
    });
    const fails = await addSubscription(workspace.id, {
      status: "authorized",
    });
    server.use(
      mercadoPagoCancel(
        preapprovalFixture({ id: succeeds.providerSubscriptionId! }),
      ),
      mercadoPagoCancelFails(
        preapprovalFixture({ id: fails.providerSubscriptionId! }),
      ),
    );
    const open = [succeeds, fails].map((row) => ({
      id: row.id,
      providerSubscriptionId: row.providerSubscriptionId!,
      planId: "starter" as const,
    }));

    const outcome = await cancelOpenSubscriptions(
      env,
      { workspaceId: workspace.id, userId: owner.id, role: "owner" },
      "request-1",
      open,
    ).catch((error: unknown) => error);

    expect(outcome).toMatchObject({ status: 503, code: "BILLING_UNAVAILABLE" });
    const rows = await subscriptionRows(workspace.id);
    expect(
      rows.find((row) => row.id === succeeds.id)?.updatedAt,
    ).toBeGreaterThan(1);
    expect(rows.find((row) => row.id === fails.id)?.status).toBe("authorized");
    expect(
      await auditActions(workspace.id, "billing.subscription.cancel"),
    ).toHaveLength(1);
  });

  it("treats a rejected cancel as success when Mercado Pago already reports cancelled", async () => {
    const { workspace, owner } = await seedWorkspace();
    const row = await addSubscription(workspace.id, { status: "authorized" });
    const fixture = preapprovalFixture({
      id: row.providerSubscriptionId!,
      status: "cancelled",
    });
    server.use(mercadoPagoCancelFails(fixture), mercadoPagoGet(fixture));

    const response = await cancel(workspace.id, owner);

    expect(response.status).toBe(204);
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "cancelled" },
    ]);
    expect(
      await auditActions(workspace.id, "billing.subscription.cancel"),
    ).toHaveLength(1);
  });

  it("keeps the row and answers 503 when the rejected cancel is not confirmed by Mercado Pago", async () => {
    const { workspace, owner } = await seedWorkspace();
    const row = await addSubscription(workspace.id, { status: "authorized" });
    const fixture = preapprovalFixture({
      id: row.providerSubscriptionId!,
      status: "authorized",
    });
    server.use(mercadoPagoCancelFails(fixture), mercadoPagoGet(fixture));

    await expectError(
      await cancel(workspace.id, owner),
      503,
      "BILLING_UNAVAILABLE",
    );
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized" },
    ]);
  });

  it("answers 503 when the access token is missing", async () => {
    const { workspace, owner } = await seedWorkspace();
    await addSubscription(workspace.id, { status: "authorized" });

    await expectError(
      await cancel(workspace.id, owner, { MP_ACCESS_TOKEN: undefined }),
      503,
      "BILLING_UNAVAILABLE",
    );
  });

  it("answers 403 to a non-owner", async () => {
    const admin = await createUser();
    const { workspace } = await seedWorkspace(
      {},
      { members: [{ user: admin, role: "admin" }] },
    );
    await addSubscription(workspace.id, { status: "authorized" });

    await expectError(await cancel(workspace.id, admin), 403, "FORBIDDEN_ROLE");
    expect(await subscriptionRows(workspace.id)).toMatchObject([
      { status: "authorized" },
    ]);
  });

  it("answers 401 without a session", async () => {
    const { workspace } = await seedWorkspace();

    await expectError(
      await cancel(workspace.id, undefined),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("answers 404 and leaves the other workspace untouched", async () => {
    const { owner } = await seedWorkspace();
    const { workspace: foreign } = await seedWorkspace();
    await addSubscription(foreign.id, { status: "authorized" });

    await expectError(await cancel(foreign.id, owner), 404, "NOT_FOUND");
    expect(await subscriptionRows(foreign.id)).toMatchObject([
      { status: "authorized" },
    ]);
  });

  it("answers 429 when the expensive limiter blocks", async () => {
    const { workspace, owner } = await seedWorkspace();
    await addSubscription(workspace.id, { status: "authorized" });

    await expectError(
      await cancel(workspace.id, owner, { RL_EXP: blockedLimiter }),
      429,
      "RATE_LIMITED",
    );
  });
});
