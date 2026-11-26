import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { buildSubscription } from "../../../src/db/fixtures/builders";
import { subscriptions } from "../../../src/db/schema/billing";
import { workspaces } from "../../../src/db/schema/workspaces";
import { meSchema } from "../../../src/shared/schemas/auth";
import { api, createUser, createWorkspace } from "../../helpers/factory";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const DAY = 24 * 60 * 60 * 1000;

const expired = () => ({ planId: "starter", trialEndsAt: Date.now() - DAY });

async function seedWorkspace(
  owner: Awaited<ReturnType<typeof createUser>>,
  billing: Partial<typeof workspaces.$inferInsert>,
) {
  const { workspace } = await createWorkspace({ owner });
  await db
    .update(workspaces)
    .set(billing)
    .where(eq(workspaces.id, workspace.id));
  return workspace;
}

async function billingBlockedOf(
  user: Awaited<ReturnType<typeof createUser>>,
  workspaceId: string,
) {
  const response = await api(app, "/api/me", {
    as: user,
    env: { RL_IP: openLimiter, RL_USER: openLimiter },
  });
  expect(response.status).toBe(200);
  const me = meSchema.parse(await response.json());
  return me.workspaces.find(({ id }) => id === workspaceId)!.billingBlocked;
}

describe("GET /api/me billingBlocked", () => {
  it("is true for an expired starter workspace", async () => {
    const owner = await createUser();
    const workspace = await seedWorkspace(owner, expired());

    expect(await billingBlockedOf(owner, workspace.id)).toBe(true);
  });

  it.each([
    ["beta", { planId: "beta", trialEndsAt: null }],
    ["an active trial", { planId: "starter", trialEndsAt: Date.now() + DAY }],
  ])("is false for %s", async (_, billing) => {
    const owner = await createUser();
    const workspace = await seedWorkspace(owner, billing);

    expect(await billingBlockedOf(owner, workspace.id)).toBe(false);
  });

  it("is false for an authorized subscription after the trial", async () => {
    const owner = await createUser();
    const workspace = await seedWorkspace(owner, expired());
    await db
      .insert(subscriptions)
      .values(buildSubscription({ workspaceId: workspace.id }));

    expect(await billingBlockedOf(owner, workspace.id)).toBe(false);
  });

  it("reports each workspace independently", async () => {
    const owner = await createUser();
    const blocked = await seedWorkspace(owner, expired());
    const open = await seedWorkspace(owner, {
      planId: "beta",
      trialEndsAt: null,
    });

    expect(await billingBlockedOf(owner, blocked.id)).toBe(true);
    expect(await billingBlockedOf(owner, open.id)).toBe(false);
  });
});
