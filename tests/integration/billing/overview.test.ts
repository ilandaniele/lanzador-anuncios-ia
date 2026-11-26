import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { billingOverviewSchema } from "../../../src/shared/schemas/billing";
import { createUser, expectError } from "../../helpers/factory";
import {
  addSubscription,
  callApi,
  DAY,
  expiredTrial,
  seedWorkspace,
} from "./helpers";

const app = createApp();
const billingOf = (workspaceId: string) => `/api/w/${workspaceId}/billing`;

describe("GET /api/w/:wid/billing", () => {
  it("returns the overview shape with the paid plans", async () => {
    const trialEndsAt = Date.now() + DAY;
    const { workspace, owner } = await seedWorkspace({
      planId: "starter",
      trialEndsAt,
    });

    const response = await callApi(app, billingOf(workspace.id), {
      as: owner,
    });

    expect(response.status).toBe(200);
    const body = billingOverviewSchema.parse(await response.json());
    expect(body).toMatchObject({
      planId: "starter",
      isFree: false,
      blocked: false,
      trialEndsAt: new Date(trialEndsAt).toISOString(),
      subscription: null,
    });
    expect(body.plans).toEqual([
      {
        id: "starter",
        name: expect.any(String),
        priceMonthlyMinor: 3000000,
        currency: "ARS",
        maxMembers: 3,
        maxAdAccounts: 2,
      },
      {
        id: "pro",
        name: expect.any(String),
        priceMonthlyMinor: 8000000,
        currency: "ARS",
        maxMembers: 10,
        maxAdAccounts: 10,
      },
    ]);
  });

  it("flags a beta workspace as free and never blocked", async () => {
    const { workspace, owner } = await seedWorkspace({ planId: "beta" });

    const body = billingOverviewSchema.parse(
      await (await callApi(app, billingOf(workspace.id), { as: owner })).json(),
    );

    expect(body).toMatchObject({ isFree: true, blocked: false });
  });

  it("stays reachable while the workspace is blocked", async () => {
    const { workspace, owner } = await seedWorkspace(expiredTrial());

    const response = await callApi(app, billingOf(workspace.id), {
      as: owner,
    });

    expect(response.status).toBe(200);
    expect(billingOverviewSchema.parse(await response.json()).blocked).toBe(
      true,
    );
  });

  it("reports the latest subscription without provider data", async () => {
    const { workspace, owner } = await seedWorkspace(expiredTrial());
    const paidUntil = Date.now() + DAY;
    const old = await addSubscription(workspace.id, {
      status: "cancelled",
      createdAt: Date.now() - 2 * DAY,
    });
    const latest = await addSubscription(workspace.id, {
      planId: "pro",
      status: "authorized",
      paidUntil,
    });

    const response = await callApi(app, billingOf(workspace.id), {
      as: owner,
    });
    const text = await response.text();

    expect(JSON.parse(text).subscription).toEqual({
      planId: "pro",
      status: "authorized",
      paidUntil: new Date(paidUntil).toISOString(),
    });
    expect(text).not.toContain(latest.providerSubscriptionId);
    expect(text).not.toContain(old.providerSubscriptionId);
    expect(text).not.toContain("init");
    expect(text).not.toContain("test-mp-access-token");
  });

  it.each(["admin", "editor", "viewer"] as const)(
    "answers 403 to a %s",
    async (role) => {
      const member = await createUser();
      const { workspace } = await seedWorkspace(
        {},
        { members: [{ user: member, role }] },
      );

      await expectError(
        await callApi(app, billingOf(workspace.id), { as: member }),
        403,
        "FORBIDDEN_ROLE",
      );
    },
  );

  it("answers 401 without a session", async () => {
    const { workspace } = await seedWorkspace();

    await expectError(
      await callApi(app, billingOf(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("answers 404 to a non-member", async () => {
    const { workspace } = await seedWorkspace();
    const outsider = await createUser();

    await expectError(
      await callApi(app, billingOf(workspace.id), { as: outsider }),
      404,
      "NOT_FOUND",
    );
  });

  it("never shows another workspace's subscription", async () => {
    const { workspace: other } = await seedWorkspace(expiredTrial());
    await addSubscription(other.id, { planId: "pro" });
    const { workspace, owner } = await seedWorkspace(expiredTrial());

    const body = billingOverviewSchema.parse(
      await (await callApi(app, billingOf(workspace.id), { as: owner })).json(),
    );

    expect(body.subscription).toBeNull();
    expect(body.blocked).toBe(true);
  });
});
