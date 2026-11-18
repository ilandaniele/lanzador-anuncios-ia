import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { launches } from "../../../src/db/schema/launches";
import { auditLog } from "../../../src/db/schema/ops";
import { pilotProposals } from "../../../src/db/schema/pilot";
import { workspaceSettings } from "../../../src/db/schema/workspaces";
import {
  approvePilotProposalResponseSchema,
  dismissPilotProposalResponseSchema,
} from "../../../src/shared/schemas/pilot";
import {
  api,
  createMetaAsset,
  createMetaConnection,
  createPilotProposal,
  expectError,
} from "../../helpers/factory";
import { captureRequests, readForm } from "../../helpers/meta-graph";
import { GRAPH_VERSION, graphUrl } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
} from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABpilotApproveToken987";
const CAMPAIGN_ID = "120200000000000100";
const AD_ID = "120200000000000300";

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const routeEnv = {
  ...keyEnv,
  GRAPH_API_VERSION: GRAPH_VERSION,
  META_APP_SECRET: "test-app-secret",
  RL_IP: openLimiter,
  RL_USER: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: routeEnv, method: "POST", ...options });

const decidePath = (wid: string, id: string, decision: string) =>
  `/api/w/${wid}/pilot/proposals/${id}/${decision}`;

const scaleProposal = {
  ruleType: "scale_winner",
  action: "scale",
  dedupeKey: `scale:${CAMPAIGN_ID}`,
  currentBudgetMinor: 5000,
  proposedBudgetMinor: 6000,
  percent: 20,
} as const;

const duplicateProposal = {
  ruleType: "duplicate_winner",
  action: "duplicate",
  objectLevel: "ad",
  objectMetaId: AD_ID,
  objectName: "Anuncio ganador",
  dedupeKey: `duplicate:${AD_ID}`,
} as const;

async function setup(overrides: Parameters<typeof createPilotProposal>[2]) {
  const seeded = await seedWorkspaceWithRoles();
  const wid = seeded.workspace.id;
  const connection = await createMetaConnection(keyEnv, wid, TOKEN);
  const asset = await createMetaAsset(wid, connection.id);
  const proposal = await createPilotProposal(wid, asset.metaId, overrides);
  return { ...seeded, wid, asset, proposal };
}

const accountNumber = (metaId: string) => metaId.replace(/^act_/, "");

const metaObject = (
  objectId: string,
  read: JsonBodyType,
  write: { body?: JsonBodyType; status?: number } = {},
) => [
  http.get(graphUrl(objectId), () => HttpResponse.json(read)),
  http.post(graphUrl(objectId), () =>
    HttpResponse.json(write.body ?? { success: true }, {
      status: write.status ?? 200,
    }),
  ),
];

const activeCampaign = (metaId: string) => ({
  account_id: accountNumber(metaId),
  name: "Campaña Demo",
  status: "ACTIVE",
});

const campaignBudget = (metaId: string, dailyBudget = "5000") => ({
  account_id: accountNumber(metaId),
  name: "Campaña Demo",
  daily_budget: dailyBudget,
});

const posts = (requests: Request[]) =>
  requests.filter((request) => request.method === "POST");

const storedProposal = async (id: string) => {
  const [row] = await db
    .select()
    .from(pilotProposals)
    .where(eq(pilotProposals.id, id));
  return row!;
};

const auditRows = (wid: string) =>
  db.select().from(auditLog).where(eq(auditLog.workspaceId, wid));

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/pilot/proposals/:id/approve", () => {
  it("pauses the object in Meta and marks the proposal executed", async () => {
    const { wid, users, asset, proposal } = await setup({});
    server.use(...metaObject(CAMPAIGN_ID, activeCampaign(asset.metaId)));
    const requests = captureRequests();

    const response = await call(decidePath(wid, proposal.id!, "approve"), {
      as: users.editor,
      body: { confirm: true },
    });

    expect(response.status).toBe(200);
    const body = approvePilotProposalResponseSchema.parse(
      await response.json(),
    );
    expect(body.proposal).toMatchObject({
      id: proposal.id,
      status: "executed",
    });
    expect(body.launchId).toBeUndefined();
    const [write] = posts(requests);
    expect(Object.fromEntries(await readForm(write!))).toMatchObject({
      status: "PAUSED",
    });
    expect(await storedProposal(proposal.id!)).toMatchObject({
      status: "executed",
      decidedBy: users.editor.id,
    });
    const audits = await auditRows(wid);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "meta.status.update",
          origin: "pilot",
          objectMetaId: CAMPAIGN_ID,
          result: "ok",
        }),
        expect.objectContaining({
          action: "pilot.proposal.approve",
          origin: "pilot",
          actorUserId: users.editor.id,
          objectMetaId: CAMPAIGN_ID,
          result: "ok",
        }),
      ]),
    );
    expect(audits).toHaveLength(2);
  });

  it("answers one of two concurrent approvals with 409", async () => {
    const { wid, users, asset, proposal } = await setup({});
    server.use(...metaObject(CAMPAIGN_ID, activeCampaign(asset.metaId)));
    const requests = captureRequests();
    const approve = () =>
      call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true },
      });

    const responses = await Promise.all([approve(), approve()]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const rejected = responses.find(({ status }) => status === 409)!;
    await expectError(rejected, 409, "PROPOSAL_STALE");
    expect(posts(requests)).toHaveLength(1);
  });

  it("scales the campaign to the proposed budget", async () => {
    const { wid, users, asset, proposal } = await setup(scaleProposal);
    server.use(...metaObject(CAMPAIGN_ID, campaignBudget(asset.metaId)));
    const requests = captureRequests();

    const response = await call(decidePath(wid, proposal.id!, "approve"), {
      as: users.editor,
      body: { confirm: true, proposedBudgetMinor: 6000 },
    });

    expect(response.status).toBe(200);
    const [write] = posts(requests);
    expect(Object.fromEntries(await readForm(write!))).toMatchObject({
      daily_budget: "6000",
    });
    expect(await auditRows(wid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "meta.budget.scale",
          origin: "pilot",
          result: "ok",
        }),
      ]),
    );
  });

  it("returns PROPOSAL_STALE when the budget changed in Meta", async () => {
    const { wid, users, asset, proposal } = await setup(scaleProposal);
    server.use(
      ...metaObject(CAMPAIGN_ID, campaignBudget(asset.metaId, "5500")),
    );
    const requests = captureRequests();

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true, proposedBudgetMinor: 6000 },
      }),
      409,
      "PROPOSAL_STALE",
    );
    expect(posts(requests)).toHaveLength(0);
    expect(await storedProposal(proposal.id!)).toMatchObject({
      status: "failed",
      resultMessage: "BUDGET_CHANGED",
    });
  });

  it("returns PROPOSAL_STALE when the budget sent differs from the proposal", async () => {
    const { wid, users, proposal } = await setup(scaleProposal);
    const requests = captureRequests();

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true, proposedBudgetMinor: 7000 },
      }),
      409,
      "PROPOSAL_STALE",
    );
    expect(requests).toHaveLength(0);
    expect((await storedProposal(proposal.id!)).status).toBe("pending");
  });

  it("requires proposedBudgetMinor to scale", async () => {
    const { wid, users, proposal } = await setup(scaleProposal);

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true },
      }),
      400,
      "VALIDATION",
    );
    expect((await storedProposal(proposal.id!)).status).toBe("pending");
  });

  it("returns 422 BUDGET_CAP above the workspace budget cap", async () => {
    const { wid, users, asset, proposal } = await setup(scaleProposal);
    await db
      .update(workspaceSettings)
      .set({ maxCampaignBudgetMinor: 5500 })
      .where(eq(workspaceSettings.workspaceId, wid));
    server.use(...metaObject(CAMPAIGN_ID, campaignBudget(asset.metaId)));
    const requests = captureRequests();

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true, proposedBudgetMinor: 6000 },
      }),
      422,
      "BUDGET_CAP",
    );
    expect(posts(requests)).toHaveLength(0);
    expect(await storedProposal(proposal.id!)).toMatchObject({
      status: "failed",
      resultMessage: "BUDGET_CAP",
    });
  });

  it("marks the proposal failed when Meta rejects the write", async () => {
    const { wid, users, asset, proposal } = await setup({});
    server.use(
      ...metaObject(CAMPAIGN_ID, activeCampaign(asset.metaId), {
        body: { error: { code: 100, message: "Invalid parameter" } },
        status: 400,
      }),
    );

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true },
      }),
      502,
      "META_ERROR",
    );
    expect(await storedProposal(proposal.id!)).toMatchObject({
      status: "failed",
      resultMessage: "META_ERROR",
    });
    expect(await auditRows(wid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "pilot.proposal.approve",
          origin: "pilot",
          result: "error",
        }),
      ]),
    );
  });

  it("creates a pilot clone draft for duplicate without calling Meta", async () => {
    const { wid, users, asset, proposal } = await setup(duplicateProposal);
    const requests = captureRequests();

    const response = await call(decidePath(wid, proposal.id!, "approve"), {
      as: users.editor,
      body: { confirm: true },
    });

    expect(response.status).toBe(200);
    const body = approvePilotProposalResponseSchema.parse(
      await response.json(),
    );
    expect(requests).toHaveLength(0);
    expect(body.proposal).toMatchObject({
      status: "executed",
      launchId: body.launchId,
    });
    const [launch] = await db
      .select()
      .from(launches)
      .where(eq(launches.id, body.launchId!));
    expect(launch).toMatchObject({
      workspaceId: wid,
      status: "draft",
      source: "pilot",
      adAccountAssetId: asset.id,
    });
    expect(JSON.parse(launch!.draft)).toEqual({
      adAccountAssetId: asset.id,
      items: [{ source: "clone", cloneAdId: AD_ID, adName: "Anuncio ganador" }],
    });
  });

  it("returns PROPOSAL_STALE for an expired proposal", async () => {
    const { wid, users, proposal } = await setup({
      expiresAt: Date.now() - 1000,
    });

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true },
      }),
      409,
      "PROPOSAL_STALE",
    );
  });

  it("returns PROPOSAL_STALE for a dismissed proposal", async () => {
    const { wid, users, proposal } = await setup({ status: "dismissed" });

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.editor,
        body: { confirm: true },
      }),
      409,
      "PROPOSAL_STALE",
    );
  });

  it("rejects a viewer with 403", async () => {
    const { wid, users, proposal } = await setup({});

    await expectError(
      await call(decidePath(wid, proposal.id!, "approve"), {
        as: users.viewer,
        body: { confirm: true },
      }),
      403,
      "FORBIDDEN_ROLE",
    );
    expect((await storedProposal(proposal.id!)).status).toBe("pending");
  });

  it("returns 404 for a proposal of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(decidePath(A.workspace.id, B.proposal.id!, "approve"), {
        as: A.users.owner,
        body: { confirm: true },
      }),
      404,
      "NOT_FOUND",
    );
    expect((await storedProposal(B.proposal.id!)).status).toBe("pending");
  });
});

describe("POST /api/w/:wid/pilot/proposals/:id/dismiss", () => {
  it("dismisses the proposal with its reason and audits it", async () => {
    const { wid, users, proposal } = await setup({});
    const requests = captureRequests();

    const response = await call(decidePath(wid, proposal.id!, "dismiss"), {
      as: users.editor,
      body: { reason: "Prefiero esperar" },
    });

    expect(response.status).toBe(200);
    expect(
      dismissPilotProposalResponseSchema.parse(await response.json()).proposal,
    ).toMatchObject({
      status: "dismissed",
      resultMessage: "Prefiero esperar",
    });
    expect(requests).toHaveLength(0);
    expect(await auditRows(wid)).toEqual([
      expect.objectContaining({
        action: "pilot.proposal.dismiss",
        origin: "pilot",
        actorUserId: users.editor.id,
        result: "ok",
      }),
    ]);
  });

  it("returns PROPOSAL_STALE when already decided", async () => {
    const { wid, users, proposal } = await setup({});
    const dismiss = () =>
      call(decidePath(wid, proposal.id!, "dismiss"), {
        as: users.editor,
        body: {},
      });

    expect((await dismiss()).status).toBe(200);
    await expectError(await dismiss(), 409, "PROPOSAL_STALE");
  });

  it("rejects a viewer with 403", async () => {
    const { wid, users, proposal } = await setup({});

    await expectError(
      await call(decidePath(wid, proposal.id!, "dismiss"), {
        as: users.viewer,
        body: {},
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 404 for a proposal of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(decidePath(A.workspace.id, B.proposal.id!, "dismiss"), {
        as: A.users.owner,
        body: {},
      }),
      404,
      "NOT_FOUND",
    );
    expect((await storedProposal(B.proposal.id!)).status).toBe("pending");
  });
});
