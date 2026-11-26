import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { buildSubscription } from "../../../src/db/fixtures/builders";
import { subscriptions } from "../../../src/db/schema/billing";
import { workspaces } from "../../../src/db/schema/workspaces";
import {
  api,
  createUser,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { blockedLimiter, openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};
const DAY = 24 * 60 * 60 * 1000;

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

async function seedWorkspace(
  billing: Partial<typeof workspaces.$inferInsert> = {},
  members: Parameters<typeof createWorkspace>[0] = {},
) {
  const seeded = await createWorkspace(members);
  await db
    .update(workspaces)
    .set(billing)
    .where(eq(workspaces.id, seeded.workspace.id));
  return seeded;
}

const expired = () => ({ planId: "starter", trialEndsAt: Date.now() - DAY });

const addSubscription = (
  workspaceId: string,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) =>
  db
    .insert(subscriptions)
    .values(buildSubscription({ workspaceId, ...overrides }));

const settingsOf = (workspaceId: string) => `/api/w/${workspaceId}/settings`;

describe("billing access", () => {
  it("blocks an expired starter workspace with 402", async () => {
    const { workspace, owner } = await seedWorkspace(expired());

    await expectError(
      await call(settingsOf(workspace.id), { as: owner }),
      402,
      "PAYMENT_REQUIRED",
    );
    await expectError(
      await call(`/api/w/${workspace.id}/products`, {
        as: owner,
        method: "POST",
        body: {},
      }),
      402,
      "PAYMENT_REQUIRED",
    );
  });

  it("keeps the workspace overview reachable while blocked", async () => {
    const { workspace, owner } = await seedWorkspace(expired());

    const response = await call(`/api/w/${workspace.id}`, { as: owner });

    expect(response.status).toBe(200);
  });

  it("lets a blocked member leave the workspace", async () => {
    const viewer = await createUser();
    const { workspace } = await seedWorkspace(expired(), {
      members: [{ user: viewer, role: "viewer" }],
    });

    const response = await call(`/api/w/${workspace.id}/members/${viewer.id}`, {
      as: viewer,
      method: "DELETE",
    });

    expect(response.status).toBe(204);
  });

  it("lets the owner start the workspace delete while blocked", async () => {
    const { workspace, owner } = await seedWorkspace(expired());

    const response = await call(`/api/w/${workspace.id}`, {
      as: owner,
      method: "DELETE",
      body: { confirmName: workspace.name },
    });

    expect(response.status).toBe(202);
  });

  it("allows an active trial", async () => {
    const { workspace, owner } = await seedWorkspace({
      planId: "starter",
      trialEndsAt: Date.now() + DAY,
    });

    const response = await call(settingsOf(workspace.id), { as: owner });

    expect(response.status).toBe(200);
  });

  it("allows an authorized subscription after the trial", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id);

    const response = await call(settingsOf(workspace.id), { as: owner });

    expect(response.status).toBe(200);
  });

  it("blocks an authorized subscription that never paid once the grace is over", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id, {
      authorizedAt: Date.now() - 4 * DAY,
    });

    await expectError(
      await call(settingsOf(workspace.id), { as: owner }),
      402,
      "PAYMENT_REQUIRED",
    );
  });

  it("grants the authorization grace only once per workspace", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id, {
      status: "cancelled",
      authorizedAt: Date.now() - 10 * DAY,
    });
    await addSubscription(workspace.id, {
      authorizedAt: Date.now() - 1000,
    });

    await expectError(
      await call(settingsOf(workspace.id), { as: owner }),
      402,
      "PAYMENT_REQUIRED",
    );
  });

  it("keeps access during the renewal slack after paidUntil", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id, { paidUntil: Date.now() - DAY });

    const response = await call(settingsOf(workspace.id), { as: owner });

    expect(response.status).toBe(200);
  });

  it("allows a cancelled subscription until paidUntil", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id, {
      status: "cancelled",
      paidUntil: Date.now() + DAY,
    });

    const response = await call(settingsOf(workspace.id), { as: owner });

    expect(response.status).toBe(200);
  });

  it("blocks a cancelled subscription past paidUntil and the renewal slack", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id, {
      status: "cancelled",
      paidUntil: Date.now() - 3 * DAY,
    });

    await expectError(
      await call(settingsOf(workspace.id), { as: owner }),
      402,
      "PAYMENT_REQUIRED",
    );
  });

  it("blocks a pending subscription", async () => {
    const { workspace, owner } = await seedWorkspace(expired());
    await addSubscription(workspace.id, { status: "pending" });

    await expectError(
      await call(settingsOf(workspace.id), { as: owner }),
      402,
      "PAYMENT_REQUIRED",
    );
  });

  it("never blocks a beta workspace", async () => {
    const { workspace, owner } = await seedWorkspace({
      planId: "beta",
      trialEndsAt: null,
    });

    const response = await call(settingsOf(workspace.id), { as: owner });

    expect(response.status).toBe(200);
  });

  it("answers 403 WORKSPACE_DISABLED before billing", async () => {
    const { workspace, owner } = await seedWorkspace({
      ...expired(),
      status: "disabled",
    });

    await expectError(
      await call(settingsOf(workspace.id), { as: owner }),
      403,
      "WORKSPACE_DISABLED",
    );
  });

  it("answers 404 to a non-member of an expired workspace", async () => {
    const { workspace } = await seedWorkspace(expired());
    const outsider = await createUser();

    await expectError(
      await call(settingsOf(workspace.id), { as: outsider }),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 401 without a session", async () => {
    const { workspace } = await seedWorkspace(expired());

    await expectError(
      await call(settingsOf(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });
});

describe("POST /api/workspaces rate limit", () => {
  it("answers 429 when the expensive limiter blocks", async () => {
    const user = await createUser();

    const response = await api(app, "/api/workspaces", {
      as: user,
      method: "POST",
      body: { name: "Mi marca" },
      env: { ...openLimits, RL_EXP: blockedLimiter },
    });

    await expectError(response, 429, "RATE_LIMITED");
  });
});
