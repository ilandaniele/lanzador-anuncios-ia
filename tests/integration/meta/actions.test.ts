import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { auditLog } from "../../../src/db/schema/ops";
import { protectedCampaigns } from "../../../src/db/schema/pilot";
import { workspaceSettings } from "../../../src/db/schema/workspaces";
import {
  objectStatusResponseSchema,
  protectedCampaignsPageSchema,
  scaleCampaignResponseSchema,
} from "../../../src/shared/schemas/meta-actions";
import sessionFixture from "../../fixtures/meta/error-session.json";
import {
  api,
  createMetaAsset,
  createMetaConnection,
  createUser,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { captureRequests, readForm } from "../../helpers/meta-graph";
import { GRAPH_VERSION, graphUrl } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABactionsRouteToken321";
const CAMPAIGN_ID = "120200000000000100";
const OTHER_CAMPAIGN_ID = "120200000000000101";
const AD_ID = "120200000000000200";
const FOREIGN_ACCOUNT = "424242424242";
const META_PARAM_ERROR = { error: { code: 100, message: "Invalid parameter" } };

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
  api(app, path, { env: routeEnv, ...options });

async function setup() {
  const viewer = await createUser();
  const { workspace, owner } = await createWorkspace({
    members: [{ user: viewer, role: "viewer" }],
  });
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { wid: workspace.id, owner, viewer, asset };
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

const posts = (requests: Request[]) =>
  requests.filter((request) => request.method === "POST");

const auditRows = (wid: string) =>
  db.select().from(auditLog).where(eq(auditLog.workspaceId, wid));

const statusPath = (wid: string, objectId = CAMPAIGN_ID) =>
  `/api/w/${wid}/meta/objects/${objectId}/status`;

const scalePath = (wid: string, campaignId = CAMPAIGN_ID) =>
  `/api/w/${wid}/meta/campaigns/${campaignId}/scale`;

const protectedPath = (wid: string, campaignId?: string) =>
  `/api/w/${wid}/protected-campaigns${campaignId ? `/${campaignId}` : ""}`;

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/meta/objects/:objectId/status", () => {
  const statusBody = (assetId: string, overrides = {}) => ({
    adAccountAssetId: assetId,
    level: "campaign",
    status: "PAUSED",
    confirm: true,
    ...overrides,
  });

  it("pauses the object and audits before and after", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, {
        account_id: accountNumber(asset.metaId),
        name: "Campaña Ganadora",
        status: "ACTIVE",
      }),
    );
    const requests = captureRequests();

    const response = await call(statusPath(wid), {
      as: owner,
      method: "POST",
      body: statusBody(asset.id),
    });

    expect(response.status).toBe(200);
    expect(objectStatusResponseSchema.parse(await response.json())).toEqual({
      status: "PAUSED",
    });
    const [write] = posts(requests);
    expect(Object.fromEntries(await readForm(write!))).toMatchObject({
      status: "PAUSED",
    });
    const [audit] = await auditRows(wid);
    expect(audit).toMatchObject({
      actorUserId: owner.id,
      origin: "manual",
      action: "meta.status.update",
      objectType: "campaign",
      objectMetaId: CAMPAIGN_ID,
      objectName: "Campaña Ganadora",
      adAccountMetaId: asset.metaId,
      result: "ok",
    });
    expect(JSON.parse(audit!.detail!)).toEqual({
      before: { status: "ACTIVE" },
      after: { status: "PAUSED" },
    });
  });

  it("activates an ad", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(AD_ID, {
        account_id: accountNumber(asset.metaId),
        name: "Anuncio",
        status: "PAUSED",
      }),
    );

    const response = await call(statusPath(wid, AD_ID), {
      as: owner,
      method: "POST",
      body: statusBody(asset.id, { level: "ad", status: "ACTIVE" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ACTIVE" });
    expect(await auditRows(wid)).toEqual([
      expect.objectContaining({ objectType: "ad", result: "ok" }),
    ]);
  });

  it("skips the write when the object already has that status", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, {
        account_id: accountNumber(asset.metaId),
        name: "Ya pausada",
        status: "PAUSED",
      }),
    );
    const requests = captureRequests();

    const response = await call(statusPath(wid), {
      as: owner,
      method: "POST",
      body: statusBody(asset.id),
    });

    expect(await response.json()).toEqual({ status: "PAUSED" });
    expect(posts(requests)).toHaveLength(0);
    expect(await auditRows(wid)).toEqual([]);
  });

  it("returns 404 for an object of another ad account without writing", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, {
        account_id: FOREIGN_ACCOUNT,
        name: "Ajena",
        status: "ACTIVE",
      }),
    );
    const requests = captureRequests();

    await expectError(
      await call(statusPath(wid), {
        as: owner,
        method: "POST",
        body: statusBody(asset.id),
      }),
      404,
      "NOT_FOUND",
    );
    expect(posts(requests)).toHaveLength(0);
    expect(await auditRows(wid)).toEqual([]);
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();
    const requests = captureRequests();

    await expectError(
      await call(statusPath(other.workspace.id), {
        as: other.owner,
        method: "POST",
        body: statusBody(asset.id),
      }),
      404,
      "NOT_FOUND",
    );
    expect(requests).toHaveLength(0);
  });

  it.each(["DELETED", "ARCHIVED"])(
    "returns 422 INVALID_STATUS for %s without calling Meta",
    async (status) => {
      const { wid, owner, asset } = await setup();
      const requests = captureRequests();

      await expectError(
        await call(statusPath(wid), {
          as: owner,
          method: "POST",
          body: statusBody(asset.id, { status }),
        }),
        422,
        "INVALID_STATUS",
      );
      expect(requests).toHaveLength(0);
    },
  );

  it("returns 422 INVALID_STATUS for an archived object", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, {
        account_id: accountNumber(asset.metaId),
        name: "Archivada",
        status: "ARCHIVED",
      }),
    );
    const requests = captureRequests();

    await expectError(
      await call(statusPath(wid), {
        as: owner,
        method: "POST",
        body: statusBody(asset.id, { status: "ACTIVE" }),
      }),
      422,
      "INVALID_STATUS",
    );
    expect(posts(requests)).toHaveLength(0);
  });

  it("returns 400 without confirm", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(statusPath(wid), {
        as: owner,
        method: "POST",
        body: statusBody(asset.id, { confirm: false }),
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 404 for an object id that is not a Meta id", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(statusPath(wid, "act_1"), {
        as: owner,
        method: "POST",
        body: statusBody(asset.id),
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 403 to a viewer", async () => {
    const { wid, viewer, asset } = await setup();

    await expectError(
      await call(statusPath(wid), {
        as: viewer,
        method: "POST",
        body: statusBody(asset.id),
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 502 and audits the failure when Meta rejects the write", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(
        CAMPAIGN_ID,
        {
          account_id: accountNumber(asset.metaId),
          name: "Campaña",
          status: "ACTIVE",
        },
        { body: META_PARAM_ERROR, status: 400 },
      ),
    );

    await expectError(
      await call(statusPath(wid), {
        as: owner,
        method: "POST",
        body: statusBody(asset.id),
      }),
      502,
      "META_ERROR",
    );
    const rows = await auditRows(wid);
    expect(rows).toEqual([
      expect.objectContaining({
        action: "meta.status.update",
        result: "error",
      }),
    ]);
    expect(JSON.parse(rows[0]!.detail!).error).toMatchObject({ code: 100 });
  });

  it("returns 409 META_RECONNECT_REQUIRED on a session error", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      http.get(graphUrl(CAMPAIGN_ID), () =>
        HttpResponse.json(sessionFixture, { status: 400 }),
      ),
    );

    await expectError(
      await call(statusPath(wid), {
        as: owner,
        method: "POST",
        body: statusBody(asset.id),
      }),
      409,
      "META_RECONNECT_REQUIRED",
    );
    expect(await auditRows(wid)).toEqual([]);
  });
});

describe("POST /api/w/:wid/meta/campaigns/:campaignId/scale", () => {
  const scaleBody = (assetId: string, overrides = {}) => ({
    adAccountAssetId: assetId,
    percent: 20,
    expectedCurrentBudgetMinor: 5000,
    confirm: true,
    ...overrides,
  });

  const campaignBudget = (
    accountId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    account_id: accountId,
    name: "Campaña CBO",
    daily_budget: "5000",
    ...overrides,
  });

  it("raises the daily budget and audits before and after", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, campaignBudget(accountNumber(asset.metaId))),
    );
    const requests = captureRequests();

    const response = await call(scalePath(wid), {
      as: owner,
      method: "POST",
      body: scaleBody(asset.id),
    });

    expect(response.status).toBe(200);
    expect(scaleCampaignResponseSchema.parse(await response.json())).toEqual({
      previousBudgetMinor: 5000,
      newBudgetMinor: 6000,
    });
    const [write] = posts(requests);
    expect(Object.fromEntries(await readForm(write!))).toMatchObject({
      daily_budget: "6000",
    });
    const [audit] = await auditRows(wid);
    expect(audit).toMatchObject({
      action: "meta.budget.scale",
      objectType: "campaign",
      objectMetaId: CAMPAIGN_ID,
      objectName: "Campaña CBO",
      adAccountMetaId: asset.metaId,
      result: "ok",
    });
    expect(JSON.parse(audit!.detail!)).toEqual({
      percent: 20,
      before: { dailyBudgetMinor: 5000 },
      after: { dailyBudgetMinor: 6000 },
    });
  });

  it("returns 409 BUDGET_CHANGED when Meta's budget differs from the expected one", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(
        CAMPAIGN_ID,
        campaignBudget(accountNumber(asset.metaId), { daily_budget: "7000" }),
      ),
    );
    const requests = captureRequests();

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      409,
      "BUDGET_CHANGED",
    );
    expect(posts(requests)).toHaveLength(0);
    expect(await auditRows(wid)).toEqual([]);
  });

  it("returns 422 SCALE_LIMIT above 50%", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, campaignBudget(accountNumber(asset.metaId))),
    );
    const requests = captureRequests();

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id, { percent: 51 }),
      }),
      422,
      "SCALE_LIMIT",
    );
    expect(posts(requests)).toHaveLength(0);
  });

  it("returns 422 SCALE_LIMIT above the workspace max_scale_percent", async () => {
    const { wid, owner, asset } = await setup();
    await db
      .update(workspaceSettings)
      .set({ maxScalePercent: 30 })
      .where(eq(workspaceSettings.workspaceId, wid));
    server.use(
      ...metaObject(CAMPAIGN_ID, campaignBudget(accountNumber(asset.metaId))),
    );

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id, { percent: 40 }),
      }),
      422,
      "SCALE_LIMIT",
    );
  });

  it("returns 422 BUDGET_CAP above the workspace budget cap", async () => {
    const { wid, owner, asset } = await setup();
    await db
      .update(workspaceSettings)
      .set({ maxCampaignBudgetMinor: 5500 })
      .where(eq(workspaceSettings.workspaceId, wid));
    server.use(
      ...metaObject(CAMPAIGN_ID, campaignBudget(accountNumber(asset.metaId))),
    );
    const requests = captureRequests();

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      422,
      "BUDGET_CAP",
    );
    expect(posts(requests)).toHaveLength(0);
  });

  it("returns 422 NOT_CBO for a campaign without a daily budget", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(
        CAMPAIGN_ID,
        campaignBudget(accountNumber(asset.metaId), {
          daily_budget: undefined,
        }),
      ),
    );

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      422,
      "NOT_CBO",
    );
  });

  it("returns 404 for a campaign of another ad account without writing", async () => {
    const { wid, owner, asset } = await setup();
    server.use(...metaObject(CAMPAIGN_ID, campaignBudget(FOREIGN_ACCOUNT)));
    const requests = captureRequests();

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      404,
      "NOT_FOUND",
    );
    expect(posts(requests)).toHaveLength(0);
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();
    const requests = captureRequests();

    await expectError(
      await call(scalePath(other.workspace.id), {
        as: other.owner,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      404,
      "NOT_FOUND",
    );
    expect(requests).toHaveLength(0);
  });

  it("returns 403 to a viewer", async () => {
    const { wid, viewer, asset } = await setup();

    await expectError(
      await call(scalePath(wid), {
        as: viewer,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 400 without the expected current budget", async () => {
    const { wid, owner, asset } = await setup();

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id, { expectedCurrentBudgetMinor: undefined }),
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 502 and audits the failure when Meta rejects the write", async () => {
    const { wid, owner, asset } = await setup();
    server.use(
      ...metaObject(CAMPAIGN_ID, campaignBudget(accountNumber(asset.metaId)), {
        body: META_PARAM_ERROR,
        status: 400,
      }),
    );

    await expectError(
      await call(scalePath(wid), {
        as: owner,
        method: "POST",
        body: scaleBody(asset.id),
      }),
      502,
      "META_ERROR",
    );
    expect(await auditRows(wid)).toEqual([
      expect.objectContaining({
        action: "meta.budget.scale",
        result: "error",
      }),
    ]);
  });
});

describe("/api/w/:wid/protected-campaigns", () => {
  const protect = (wid: string, as: Caller["as"], assetId: string) =>
    call(protectedPath(wid, CAMPAIGN_ID), {
      as,
      method: "PUT",
      body: { adAccountAssetId: assetId },
    });

  const campaignObject = (accountId: string) =>
    metaObject(CAMPAIGN_ID, {
      account_id: accountId,
      name: "Campaña Protegida",
      status: "ACTIVE",
    });

  it("protects a campaign, lists it and audits once", async () => {
    const { wid, owner, viewer, asset } = await setup();
    server.use(...campaignObject(accountNumber(asset.metaId)));

    expect((await protect(wid, owner, asset.id)).status).toBe(204);
    expect((await protect(wid, owner, asset.id)).status).toBe(204);

    const response = await call(protectedPath(wid), { as: viewer });
    expect(response.status).toBe(200);
    expect(protectedCampaignsPageSchema.parse(await response.json())).toEqual({
      data: [
        {
          campaignId: CAMPAIGN_ID,
          adAccountId: asset.metaId,
          protectedBy: owner.id,
          createdAt: expect.any(String),
        },
      ],
      nextCursor: null,
    });
    expect(await auditRows(wid)).toEqual([
      expect.objectContaining({
        action: "campaign.protect",
        objectMetaId: CAMPAIGN_ID,
        objectName: "Campaña Protegida",
        adAccountMetaId: asset.metaId,
      }),
    ]);
  });

  it("paginates the list by campaign id", async () => {
    const { wid, owner, asset } = await setup();
    await db.insert(protectedCampaigns).values(
      [CAMPAIGN_ID, OTHER_CAMPAIGN_ID].map((campaignMetaId) => ({
        workspaceId: wid,
        campaignMetaId,
        adAccountMetaId: asset.metaId,
        createdAt: Date.now(),
      })),
    );

    const first = protectedCampaignsPageSchema.parse(
      await (await call(`${protectedPath(wid)}?limit=1`, { as: owner })).json(),
    );
    const second = protectedCampaignsPageSchema.parse(
      await (
        await call(`${protectedPath(wid)}?limit=1&cursor=${first.nextCursor}`, {
          as: owner,
        })
      ).json(),
    );

    expect(first.data.map(({ campaignId }) => campaignId)).toEqual([
      CAMPAIGN_ID,
    ]);
    expect(second).toEqual({
      data: [expect.objectContaining({ campaignId: OTHER_CAMPAIGN_ID })],
      nextCursor: null,
    });
  });

  it("returns 404 when protecting a campaign of another ad account", async () => {
    const { wid, owner, asset } = await setup();
    server.use(...campaignObject(FOREIGN_ACCOUNT));

    await expectError(await protect(wid, owner, asset.id), 404, "NOT_FOUND");
    expect(await auditRows(wid)).toEqual([]);
  });

  it("returns 404 when protecting with an ad account of another workspace", async () => {
    const { asset } = await setup();
    const other = await createWorkspace();

    await expectError(
      await protect(other.workspace.id, other.owner, asset.id),
      404,
      "NOT_FOUND",
    );
  });

  it("unprotects a campaign and audits it", async () => {
    const { wid, owner, asset } = await setup();
    server.use(...campaignObject(accountNumber(asset.metaId)));
    await protect(wid, owner, asset.id);

    const response = await call(protectedPath(wid, CAMPAIGN_ID), {
      as: owner,
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    const list = await call(protectedPath(wid), { as: owner });
    expect((await list.json()) as unknown).toEqual({
      data: [],
      nextCursor: null,
    });
    expect(
      (await auditRows(wid)).map(({ action, adAccountMetaId }) => ({
        action,
        adAccountMetaId,
      })),
    ).toEqual(
      expect.arrayContaining([
        { action: "campaign.protect", adAccountMetaId: asset.metaId },
        { action: "campaign.unprotect", adAccountMetaId: asset.metaId },
      ]),
    );
    await expectError(
      await call(protectedPath(wid, CAMPAIGN_ID), {
        as: owner,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 when unprotecting a campaign of another workspace", async () => {
    const victim = await setup();
    await db.insert(protectedCampaigns).values({
      workspaceId: victim.wid,
      campaignMetaId: CAMPAIGN_ID,
      adAccountMetaId: victim.asset.metaId,
      createdAt: Date.now(),
    });
    const other = await createWorkspace();

    await expectError(
      await call(protectedPath(other.workspace.id, CAMPAIGN_ID), {
        as: other.owner,
        method: "DELETE",
      }),
      404,
      "NOT_FOUND",
    );
    const rows = await db
      .select()
      .from(protectedCampaigns)
      .where(eq(protectedCampaigns.workspaceId, victim.wid));
    expect(rows).toHaveLength(1);
    expect(await auditRows(other.workspace.id)).toEqual([]);
  });

  it("does not list campaigns of another workspace", async () => {
    const victim = await setup();
    await db.insert(protectedCampaigns).values({
      workspaceId: victim.wid,
      campaignMetaId: CAMPAIGN_ID,
      adAccountMetaId: victim.asset.metaId,
      createdAt: Date.now(),
    });
    const other = await createWorkspace();

    const response = await call(protectedPath(other.workspace.id), {
      as: other.owner,
    });

    expect(await response.json()).toEqual({ data: [], nextCursor: null });
  });

  it("returns 403 to a viewer on writes", async () => {
    const { wid, viewer, asset } = await setup();

    await expectError(
      await protect(wid, viewer, asset.id),
      403,
      "FORBIDDEN_ROLE",
    );
    await expectError(
      await call(protectedPath(wid, CAMPAIGN_ID), {
        as: viewer,
        method: "DELETE",
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });
});
