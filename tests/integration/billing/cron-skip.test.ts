import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { AI_TAGGING_ESTIMATED_NEURONS } from "../../../src/shared/constants";
import { utcPeriods } from "../../../src/api/lib/time";
import {
  selectPilotEligibleWorkspaceIds,
  selectRecentlyActiveWorkspaceIds,
} from "../../../src/api/repositories/maintenance";
import { selectPendingTagsWithBudget } from "../../../src/api/repositories/pending-tags";
import { insertDefaultPilotRules } from "../../../src/api/repositories/pilot-rules";
import { selectStaleThumbnails } from "../../../src/api/repositories/thumbnails";
import { buildSubscription } from "../../../src/db/fixtures/builders";
import { subscriptions } from "../../../src/db/schema/billing";
import { workspaces } from "../../../src/db/schema/workspaces";
import {
  createCreative,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
} from "../../helpers/factory";

const db = drizzle(env.DB);
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const LIMIT = 1000;
const RETAG_LIMITS = {
  neuronsPerTag: AI_TAGGING_ESTIMATED_NEURONS,
  perWorkspace: 5,
  total: LIMIT,
};

const billingCases = {
  expired: { planId: "starter", trialEndsAt: NOW - DAY },
  beta: { planId: "beta", trialEndsAt: null },
  trial: { planId: "starter", trialEndsAt: NOW + DAY },
  authorized: { planId: "starter", trialEndsAt: NOW - DAY },
};

type CaseName = keyof typeof billingCases;

async function seedWorkspace(name: CaseName) {
  const { workspace } = await createWorkspace();
  await db
    .update(workspaces)
    .set({ ...billingCases[name], lastActivityAt: NOW - 1000 })
    .where(eq(workspaces.id, workspace.id));
  if (name === "authorized") {
    await db
      .insert(subscriptions)
      .values(buildSubscription({ workspaceId: workspace.id }));
  }
  await insertDefaultPilotRules(env.DB, workspace.id, NOW);
  const connection = await createMetaConnection(
    env,
    workspace.id,
    "cron-token",
  );
  const asset = await createMetaAsset(workspace.id, connection.id);
  await createCreative(workspace.id, asset.id, {
    thumbnailUrl: "https://scontent.fbcdn.net/thumb.jpg",
    thumbnailRefreshedAt: NOW - 30 * DAY,
    aiStatus: "pending",
  });
  return workspace.id;
}

async function seedAll() {
  const ids = {} as Record<CaseName, string>;
  for (const name of Object.keys(billingCases) as CaseName[]) {
    ids[name] = await seedWorkspace(name);
  }
  return ids;
}

const expectBillingFilter = (
  selected: string[],
  ids: Record<CaseName, string>,
) => {
  expect(selected).toEqual(
    expect.arrayContaining([ids.beta, ids.trial, ids.authorized]),
  );
  expect(selected).not.toContain(ids.expired);
};

describe("cron selectors skip workspaces that must pay", () => {
  it("insights prewarm", async () => {
    const ids = await seedAll();

    const selected = await selectRecentlyActiveWorkspaceIds(
      env.DB,
      { at: NOW, activeSince: NOW - DAY },
      LIMIT,
    );

    expectBillingFilter(selected, ids);
  });

  it("autopilot", async () => {
    const ids = await seedAll();

    const selected = await selectPilotEligibleWorkspaceIds(env.DB, NOW, LIMIT);

    expectBillingFilter(selected, ids);
  });

  it("pending tag retry", async () => {
    const ids = await seedAll();

    const pending = await selectPendingTagsWithBudget(
      env.DB,
      { at: NOW, ...utcPeriods(NOW) },
      env.WORKERS_AI_DAILY_NEURON_CAP,
      RETAG_LIMITS,
    );

    expectBillingFilter(
      pending.map(({ workspaceId }) => workspaceId),
      ids,
    );
  });

  it("thumbnail refresh", async () => {
    const ids = await seedAll();

    const stale = await selectStaleThumbnails(
      env.DB,
      { at: NOW, refreshedBefore: NOW - DAY },
      LIMIT,
    );

    expectBillingFilter(
      stale.map(({ workspaceId }) => workspaceId),
      ids,
    );
  });
});
