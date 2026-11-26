import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import {
  billingAllowed,
  billingStateColumns,
  toBillingState,
} from "../../../src/api/repositories/billing-access";
import { buildSubscription } from "../../../src/db/fixtures/builders";
import { subscriptions } from "../../../src/db/schema/billing";
import { workspaces } from "../../../src/db/schema/workspaces";
import {
  AUTHORIZATION_GRACE_MS,
  isBillingBlocked,
  RENEWAL_SLACK_MS,
} from "../../../src/shared/billing";
import { createWorkspace } from "../../helpers/factory";

const db = drizzle(env.DB);
const DAY = 24 * 60 * 60 * 1000;

type Row = {
  workspace: Partial<typeof workspaces.$inferInsert>;
  subscription?: Partial<typeof subscriptions.$inferInsert>;
  previous?: Partial<typeof subscriptions.$inferInsert>;
};

const truthTable = (at: number): Row[] => [
  { workspace: { planId: "beta" } },
  { workspace: { planId: "beta", trialEndsAt: at - DAY } },
  { workspace: { planId: "starter", trialEndsAt: at + DAY } },
  { workspace: { planId: "starter", trialEndsAt: at - DAY } },
  { workspace: { planId: "starter", trialEndsAt: at } },
  { workspace: { planId: "starter" } },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: { status: "authorized" },
  },
  {
    workspace: { planId: "pro" },
    subscription: { planId: "pro", status: "authorized", paidUntil: at - DAY },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: { status: "cancelled", paidUntil: at + DAY },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: { status: "cancelled", paidUntil: at - DAY },
  },
  {
    workspace: { planId: "starter" },
    subscription: { status: "paused", paidUntil: at },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: {
      status: "authorized",
      authorizedAt: at - AUTHORIZATION_GRACE_MS + 1000,
    },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: {
      status: "authorized",
      authorizedAt: at - AUTHORIZATION_GRACE_MS,
    },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: { status: "authorized", authorizedAt: null },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: {
      status: "authorized",
      authorizedAt: at - 30 * DAY,
      paidUntil: at + DAY,
    },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: {
      status: "cancelled",
      authorizedAt: at,
      paidUntil: at - DAY,
    },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: { status: "pending" },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    previous: {
      status: "cancelled",
      authorizedAt: at - 10 * DAY,
      paidUntil: null,
    },
    subscription: { status: "authorized", authorizedAt: at - 1000 },
  },
  {
    workspace: { planId: "pro", trialEndsAt: at - DAY },
    previous: {
      status: "cancelled",
      authorizedAt: at - 40 * DAY,
      paidUntil: at - 10 * DAY,
    },
    subscription: {
      planId: "pro",
      status: "authorized",
      authorizedAt: at - 1000,
    },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    previous: {
      status: "cancelled",
      authorizedAt: at - 1000,
      paidUntil: null,
    },
    subscription: { status: "authorized", authorizedAt: at - 500 },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: {
      status: "authorized",
      authorizedAt: at - 30 * DAY,
      paidUntil: at - RENEWAL_SLACK_MS + 1000,
    },
  },
  {
    workspace: { planId: "starter", trialEndsAt: at - DAY },
    subscription: {
      status: "authorized",
      authorizedAt: at - 30 * DAY,
      paidUntil: at - RENEWAL_SLACK_MS,
    },
  },
];

async function seedRow(row: Row) {
  const { workspace } = await createWorkspace();
  await db
    .update(workspaces)
    .set(row.workspace)
    .where(eq(workspaces.id, workspace.id));
  if (row.previous) {
    await db
      .insert(subscriptions)
      .values(
        buildSubscription({ workspaceId: workspace.id, ...row.previous }),
      );
  }
  if (row.subscription) {
    await db
      .insert(subscriptions)
      .values(
        buildSubscription({ workspaceId: workspace.id, ...row.subscription }),
      );
  }
  return workspace.id;
}

describe("billing access SQL and pure rule", () => {
  it("allow the same workspaces on every truth table row", async () => {
    const at = Date.now();
    const seeded = await Promise.all(truthTable(at).map(seedRow));

    const allowedBySql = (
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(billingAllowed(at))
    )
      .map((row) => row.id)
      .filter((id) => seeded.includes(id))
      .sort();
    const stateRows = await db
      .select({ id: workspaces.id, ...billingStateColumns })
      .from(workspaces)
      .where(inArray(workspaces.id, seeded));
    const allowedByRule = stateRows
      .filter((row) => !isBillingBlocked(toBillingState(row), at))
      .map((row) => row.id)
      .sort();

    expect(stateRows).toHaveLength(seeded.length);
    expect(allowedByRule.length).toBeGreaterThan(0);
    expect(allowedByRule.length).toBeLessThan(seeded.length);
    expect(allowedBySql).toEqual(allowedByRule);
  });
});
