import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { bytesToHex, hmacSha256 } from "../../../src/api/lib/hash";
import { DAY_MS } from "../../../src/api/lib/time";
import { plans } from "../../../src/db/schema/auth";
import { creatives } from "../../../src/db/schema/creatives";
import { metaAssets, metaConnections } from "../../../src/db/schema/meta";
import { auditLog } from "../../../src/db/schema/ops";
import { workspaces } from "../../../src/db/schema/workspaces";
import {
  assetsListResponseSchema,
  assetsResponseSchema,
  connectionsResponseSchema,
} from "../../../src/shared/schemas/meta-connections";
import adAccountsFixture from "../../fixtures/meta/adaccounts.json";
import accountsFixture from "../../fixtures/meta/accounts.json";
import sessionFixture from "../../fixtures/meta/error-session.json";
import {
  api,
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import {
  GRAPH_VERSION,
  graphUrl,
  metaFails,
  metaMe,
  metaNetworkError,
  metaReplies,
  metaServerError,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABconnectionsRouteToken321";
const APP_SECRET = "test-app-secret";

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const routeEnv = {
  ...keyEnv,
  GRAPH_API_VERSION: GRAPH_VERSION,
  META_APP_ID: "1234567890",
  META_APP_SECRET: APP_SECRET,
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: routeEnv, ...options });

const metaPath = (workspaceId: string, suffix: string) =>
  `/api/w/${workspaceId}/meta/${suffix}`;

async function setup() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN, {
    tokenExpiresAt: 1_900_000_000_000,
    scopes: '["ads_read","ads_management"]',
  });
  return { wid: workspace.id, owner, connection };
}

async function insertCreative(workspaceId: string, adAccountAssetId: string) {
  const at = Date.now();
  await db.insert(creatives).values({
    id: crypto.randomUUID(),
    workspaceId,
    adAccountAssetId,
    kind: "image",
    originalFilename: "foto.png",
    contentType: "image/png",
    sizeBytes: 1024,
    source: "browser",
    status: "ready",
    createdAt: at,
    updatedAt: at,
  });
}

const limitAdAccounts = async (workspaceId: string, maxAdAccounts: number) => {
  const planId = `plan-${crypto.randomUUID()}`;
  await db
    .insert(plans)
    .values({ id: planId, name: planId, maxAdAccounts, createdAt: Date.now() });
  await db
    .update(workspaces)
    .set({ planId, trialEndsAt: Date.now() + DAY_MS })
    .where(eq(workspaces.id, workspaceId));
};

const connectionRows = (workspaceId: string) =>
  db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId));

const assetRows = (workspaceId: string) =>
  db.select().from(metaAssets).where(eq(metaAssets.workspaceId, workspaceId));

const auditRows = (workspaceId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.action, action)),
    );

const serveDiscovery = () =>
  server.use(
    metaMe(),
    metaReplies("me/adaccounts", adAccountsFixture),
    metaReplies("me/accounts", accountsFixture),
  );

afterEach(() => {
  server.events.removeAllListeners();
});

describe("GET /api/w/:wid/meta/connections", () => {
  it("returns 401 without a session", async () => {
    const { wid } = await setup();

    await expectError(
      await call(metaPath(wid, "connections")),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("lists connections with expiry and creative counts, without token fields", async () => {
    const { wid, owner, connection } = await setup();
    const second = await createMetaConnection(keyEnv, wid, TOKEN);
    const [accountA, accountB] = await Promise.all([
      createMetaAsset(wid, connection.id),
      createMetaAsset(wid, connection.id),
    ]);
    const accountC = await createMetaAsset(wid, second.id);
    await Promise.all([
      insertCreative(wid, accountA.id),
      insertCreative(wid, accountA.id),
      insertCreative(wid, accountB.id),
      insertCreative(wid, accountC.id),
    ]);

    const response = await call(metaPath(wid, "connections"), { as: owner });

    expect(response.status).toBe(200);
    const { data } = connectionsResponseSchema.parse(await response.json());
    expect(Object.keys(data[0]!).sort()).toEqual([
      "businessId",
      "businessName",
      "connectedAt",
      "connectedBy",
      "creativeCount",
      "id",
      "lastErrorCode",
      "scopes",
      "status",
      "tokenExpiresAt",
    ]);
    const byId = new Map(data.map((item) => [item.id, item]));
    expect(byId.get(connection.id)).toEqual({
      id: connection.id,
      businessId: connection.metaBusinessId,
      businessName: "Negocio Demo",
      status: "active",
      scopes: ["ads_read", "ads_management"],
      connectedBy: null,
      connectedAt: new Date(connection.createdAt!).toISOString(),
      lastErrorCode: null,
      tokenExpiresAt: new Date(1_900_000_000_000).toISOString(),
      creativeCount: 3,
    });
    expect(byId.get(second.id)?.creativeCount).toBe(1);
    expect(byId.get(second.id)?.tokenExpiresAt).toBeNull();
  });

  it("reports reconnect_required and the last error code", async () => {
    const { wid, owner } = await setup();
    await createMetaConnection(keyEnv, wid, TOKEN, {
      status: "reconnect_required",
      lastErrorCode: 190,
    });

    const response = await call(metaPath(wid, "connections"), { as: owner });

    const { data } = connectionsResponseSchema.parse(await response.json());
    expect(
      data.find((item) => item.status === "reconnect_required"),
    ).toMatchObject({
      lastErrorCode: 190,
    });
  });

  it("never lists another workspace's connections", async () => {
    const { wid, owner } = await setup();
    const other = await setup();
    await createMetaAsset(other.wid, other.connection.id);

    const response = await call(metaPath(wid, "connections"), { as: owner });

    const { data } = connectionsResponseSchema.parse(await response.json());
    expect(data.map(({ id }) => id)).not.toContain(other.connection.id);
  });
});

describe("GET /api/w/:wid/meta/assets", () => {
  it("lists assets with health and no internal fields", async () => {
    const { wid, owner, connection } = await setup();
    await createMetaAsset(wid, connection.id, {
      name: "Cuenta A",
      enabled: 1,
      disableReason: 0,
      fundingOk: 1,
      spendCapPct: 40,
      healthCheckedAt: 1_800_000_000_000,
    });
    await createMetaAsset(wid, connection.id, {
      name: "Pagina B",
      kind: "page",
      enabled: 0,
      fundingOk: null,
      accountStatus: null,
      currency: null,
    });

    const response = await call(metaPath(wid, "assets"), { as: owner });

    expect(response.status).toBe(200);
    const body = assetsListResponseSchema.parse(await response.json());
    expect(body.nextCursor).toBeNull();
    expect(body.data.map(({ name }) => name)).toEqual(["Cuenta A", "Pagina B"]);
    expect(body.data[0]).toMatchObject({
      kind: "ad_account",
      enabled: true,
      currency: "USD",
      health: {
        accountStatus: 1,
        disableReason: 0,
        fundingOk: true,
        spendCapPct: 40,
        checkedAt: new Date(1_800_000_000_000).toISOString(),
      },
    });
    expect(body.data[1]).toMatchObject({
      kind: "page",
      enabled: false,
      health: { accountStatus: null, fundingOk: null, checkedAt: null },
    });
    expect(Object.keys(body.data[0]!).sort()).toEqual([
      "currency",
      "enabled",
      "health",
      "id",
      "kind",
      "metaId",
      "name",
      "parentMetaId",
    ]);
  });

  it("filters by kind and enabled", async () => {
    const { wid, owner, connection } = await setup();
    await createMetaAsset(wid, connection.id, { name: "Cuenta", enabled: 1 });
    await createMetaAsset(wid, connection.id, {
      name: "Cuenta off",
      enabled: 0,
    });
    await createMetaAsset(wid, connection.id, { name: "Pagina", kind: "page" });

    const names = async (query: string) => {
      const response = await call(`${metaPath(wid, "assets")}?${query}`, {
        as: owner,
      });
      return assetsListResponseSchema
        .parse(await response.json())
        .data.map(({ name }) => name);
    };

    expect(await names("kind=ad_account")).toEqual(["Cuenta", "Cuenta off"]);
    expect(await names("enabled=true")).toEqual(["Cuenta", "Pagina"]);
    expect(await names("kind=ad_account&enabled=false")).toEqual([
      "Cuenta off",
    ]);
  });

  it("pages through assets with a cursor", async () => {
    const { wid, owner, connection } = await setup();
    for (const name of ["a", "b", "c", "d", "e"]) {
      await createMetaAsset(wid, connection.id, { name });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const response = await call(`${metaPath(wid, "assets")}?${query}`, {
        as: owner,
      });
      const page = assetsListResponseSchema.parse(await response.json());
      seen.push(...page.data.map(({ name }) => name));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);

    expect(seen).toEqual(["a", "b", "c", "d", "e"]);
    expect(pages).toBe(3);
  });

  it.each(["limit=101", "limit=0", "kind=video", "enabled=maybe", "cursor=!!"])(
    "rejects %s with 400",
    async (query) => {
      const { wid, owner } = await setup();

      await expectError(
        await call(`${metaPath(wid, "assets")}?${query}`, { as: owner }),
        400,
        "VALIDATION",
      );
    },
  );

  it("never lists another workspace's assets", async () => {
    const { wid, owner } = await setup();
    const other = await setup();
    await createMetaAsset(other.wid, other.connection.id, { name: "Ajena" });

    const response = await call(metaPath(wid, "assets"), { as: owner });

    expect(assetsListResponseSchema.parse(await response.json()).data).toEqual(
      [],
    );
  });
});

describe("PATCH /api/w/:wid/meta/assets", () => {
  const patch = (wid: string, as: Caller["as"], body: unknown) =>
    call(metaPath(wid, "assets"), { as, method: "PATCH", body });

  it("applies the changes, returns the updated assets and audits", async () => {
    const { wid, owner, connection } = await setup();
    const off = await createMetaAsset(wid, connection.id, { enabled: 0 });
    const on = await createMetaAsset(wid, connection.id, { enabled: 1 });
    const untouched = await createMetaAsset(wid, connection.id, { enabled: 1 });

    const response = await patch(wid, owner, {
      changes: [
        { id: off.id, enabled: true },
        { id: on.id, enabled: false },
      ],
    });

    expect(response.status).toBe(200);
    const { data } = assetsResponseSchema.parse(await response.json());
    expect(
      Object.fromEntries(data.map(({ id, enabled }) => [id, enabled])),
    ).toEqual({ [off.id]: true, [on.id]: false });
    const stored = Object.fromEntries(
      (await assetRows(wid)).map(({ id, enabled }) => [id, enabled]),
    );
    expect(stored).toEqual({ [off.id]: 1, [on.id]: 0, [untouched.id]: 1 });
    const [audit, ...others] = await auditRows(wid, "meta.assets.update");
    expect(others).toHaveLength(0);
    expect(audit).toMatchObject({ actorUserId: owner.id, result: "ok" });
    expect(JSON.parse(audit!.detail!)).toEqual({
      changes: [
        { id: off.id, enabled: true },
        { id: on.id, enabled: false },
      ],
    });
  });

  it("answers 404 and changes nothing when any id is foreign or unknown", async () => {
    const { wid, owner, connection } = await setup();
    const other = await setup();
    const mine = await createMetaAsset(wid, connection.id, { enabled: 0 });
    const foreign = await createMetaAsset(other.wid, other.connection.id, {
      enabled: 0,
    });

    await expectError(
      await patch(wid, owner, {
        changes: [
          { id: mine.id, enabled: true },
          { id: foreign.id, enabled: true },
        ],
      }),
      404,
      "NOT_FOUND",
    );

    expect((await assetRows(wid))[0]!.enabled).toBe(0);
    expect((await assetRows(other.wid))[0]!.enabled).toBe(0);
    expect(await auditRows(wid, "meta.assets.update")).toHaveLength(0);
  });

  it("rejects enabling more ad accounts than the plan allows", async () => {
    const { wid, owner, connection } = await setup();
    await limitAdAccounts(wid, 2);
    await createMetaAsset(wid, connection.id, { enabled: 1 });
    const second = await createMetaAsset(wid, connection.id, { enabled: 0 });
    const third = await createMetaAsset(wid, connection.id, { enabled: 0 });

    await expectError(
      await patch(wid, owner, {
        changes: [
          { id: second.id, enabled: true },
          { id: third.id, enabled: true },
        ],
      }),
      422,
      "PLAN_AD_ACCOUNT_LIMIT",
    );

    expect(
      (await assetRows(wid)).filter(({ enabled }) => enabled === 1),
    ).toHaveLength(1);
  });

  it("allows swapping ad accounts at the limit and ignores other kinds", async () => {
    const { wid, owner, connection } = await setup();
    await limitAdAccounts(wid, 1);
    const current = await createMetaAsset(wid, connection.id, { enabled: 1 });
    const next = await createMetaAsset(wid, connection.id, { enabled: 0 });
    const page = await createMetaAsset(wid, connection.id, {
      kind: "page",
      enabled: 0,
    });
    const pixel = await createMetaAsset(wid, connection.id, {
      kind: "pixel",
      enabled: 0,
    });

    const response = await patch(wid, owner, {
      changes: [
        { id: current.id, enabled: false },
        { id: next.id, enabled: true },
        { id: page.id, enabled: true },
        { id: pixel.id, enabled: true },
      ],
    });

    expect(response.status).toBe(200);
    expect(
      (await assetRows(wid)).filter(({ enabled }) => enabled === 1),
    ).toHaveLength(3);
  });

  it("does not count an unchanged ad account twice", async () => {
    const { wid, owner, connection } = await setup();
    await limitAdAccounts(wid, 1);
    const only = await createMetaAsset(wid, connection.id, { enabled: 1 });

    const response = await patch(wid, owner, {
      changes: [{ id: only.id, enabled: true }],
    });

    expect(response.status).toBe(200);
  });

  it("rejects invalid bodies with 400", async () => {
    const { wid, owner, connection } = await setup();
    const asset = await createMetaAsset(wid, connection.id);
    const change = { id: asset.id, enabled: true };
    const tooMany = Array.from({ length: 101 }, (_, index) => ({
      id: `asset-${index}`,
      enabled: true,
    }));

    for (const body of [
      {},
      { changes: [] },
      { changes: [{ id: asset.id }] },
      { changes: [{ id: asset.id, enabled: "yes" }] },
      { changes: [change, change] },
      { changes: tooMany },
    ]) {
      await expectError(await patch(wid, owner, body), 400, "VALIDATION");
    }
  });

  it("accepts exactly 100 changes", async () => {
    const { wid, owner, connection } = await setup();
    const assets = await Promise.all(
      Array.from({ length: 100 }, () =>
        createMetaAsset(wid, connection.id, { kind: "pixel", enabled: 0 }),
      ),
    );

    const response = await patch(wid, owner, {
      changes: assets.map(({ id }) => ({ id, enabled: true })),
    });

    expect(response.status).toBe(200);
    expect(assetsResponseSchema.parse(await response.json()).data).toHaveLength(
      100,
    );
  });
});

describe("POST /api/w/:wid/meta/connections/:id/refresh-assets", () => {
  const refresh = (wid: string, id: string, as: Caller["as"]) =>
    call(metaPath(wid, `connections/${id}/refresh-assets`), {
      as,
      method: "POST",
    });

  it("syncs discovered assets, keeps enabled flags, flags vanished ones and audits", async () => {
    const { wid, owner, connection } = await setup();
    const kept = await createMetaAsset(wid, connection.id, {
      kind: "ad_account",
      metaId: "act_1001",
      name: "Nombre viejo",
      enabled: 1,
    });
    const vanished = await createMetaAsset(wid, connection.id, {
      kind: "ad_account",
      metaId: "act_gone",
      enabled: 1,
    });
    serveDiscovery();
    const requests = captureRequests();

    const response = await refresh(wid, connection.id, owner);

    expect(response.status).toBe(200);
    const { data } = assetsResponseSchema.parse(await response.json());
    expect(data).toHaveLength(8);
    expect(data.find(({ id }) => id === kept.id)).toMatchObject({
      name: "Cuenta Principal",
      enabled: true,
    });
    expect(
      data.filter(({ id }) => id !== kept.id && id !== vanished.id),
    ).toSatisfy((rest: typeof data) => rest.every(({ enabled }) => !enabled));
    const stored = await assetRows(wid);
    expect(stored.find(({ id }) => id === vanished.id)?.missingSince).toEqual(
      expect.any(Number),
    );
    expect(stored.find(({ id }) => id === kept.id)?.missingSince).toBeNull();
    const [audit] = await auditRows(wid, "meta.connection.refresh_assets");
    expect(JSON.parse(audit!.detail!)).toEqual({
      connectionId: connection.id,
      assetCount: 7,
    });
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    }
    expect(JSON.stringify(data)).not.toContain(TOKEN);
  });

  it("answers 409 without calling Meta when the connection needs reconnecting", async () => {
    const { wid, owner } = await setup();
    const stale = await createMetaConnection(keyEnv, wid, TOKEN, {
      status: "reconnect_required",
    });
    const requests = captureRequests();

    await expectError(
      await refresh(wid, stale.id, owner),
      409,
      "META_RECONNECT_REQUIRED",
    );

    expect(requests).toHaveLength(0);
  });

  it("answers 409 and flags the connection when Meta invalidates the session", async () => {
    const { wid, owner, connection } = await setup();
    server.use(metaFails("me", sessionFixture));

    await expectError(
      await refresh(wid, connection.id, owner),
      409,
      "META_RECONNECT_REQUIRED",
    );

    const [row] = await connectionRows(wid);
    expect(row).toMatchObject({
      status: "reconnect_required",
      lastErrorCode: 190,
    });
  });

  it("answers 502 META_ERROR on Meta failures and keeps the stored assets", async () => {
    const { wid, owner, connection } = await setup();
    await createMetaAsset(wid, connection.id, { name: "Intacta" });
    server.use(metaMe(), metaServerError("me/adaccounts"));

    await expectError(
      await refresh(wid, connection.id, owner),
      502,
      "META_ERROR",
    );

    const [asset] = await assetRows(wid);
    expect(asset).toMatchObject({ name: "Intacta", missingSince: null });
    expect((await connectionRows(wid))[0]!.status).toBe("active");
  });

  it("answers 404 for an unknown connection", async () => {
    const { wid, owner } = await setup();

    await expectError(await refresh(wid, "missing", owner), 404, "NOT_FOUND");
  });

  it("answers 429 when the expensive rate limit is hit", async () => {
    const { wid, owner, connection } = await setup();

    const response = await call(
      metaPath(wid, `connections/${connection.id}/refresh-assets`),
      {
        as: owner,
        method: "POST",
        env: {
          ...routeEnv,
          RL_EXP: { limit: async () => ({ success: false }) },
        },
      },
    );

    await expectError(response, 429, "RATE_LIMITED");
  });
});

describe("DELETE /api/w/:wid/meta/connections/:id", () => {
  const disconnect = (
    wid: string,
    id: string,
    as: Caller["as"],
    body: unknown = { confirm: true },
  ) => call(metaPath(wid, `connections/${id}`), { as, method: "DELETE", body });

  const serveRevoke = () => {
    server.use(
      http.delete(graphUrl("me/permissions"), () =>
        HttpResponse.json({ success: true }),
      ),
    );
    return captureRequests();
  };

  async function seedConnectionWithData() {
    const seeded = await setup();
    const asset = await createMetaAsset(seeded.wid, seeded.connection.id);
    await createMetaAsset(seeded.wid, seeded.connection.id, { kind: "page" });
    await insertCreative(seeded.wid, asset.id);
    return { ...seeded, asset };
  }

  it("revokes at Meta, deletes connection, assets and creatives, and audits", async () => {
    const { wid, owner, connection, asset } = await seedConnectionWithData();
    const survivor = await createMetaConnection(keyEnv, wid, TOKEN);
    const survivorAsset = await createMetaAsset(wid, survivor.id);
    const requests = serveRevoke();

    const response = await disconnect(wid, connection.id, owner);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(new URL(request!.url).searchParams.get("appsecret_proof")).toBe(
      bytesToHex(await hmacSha256(APP_SECRET, TOKEN)),
    );
    expect((await connectionRows(wid)).map(({ id }) => id)).toEqual([
      survivor.id,
    ]);
    expect((await assetRows(wid)).map(({ id }) => id)).toEqual([
      survivorAsset.id,
    ]);
    expect(
      await db
        .select()
        .from(creatives)
        .where(eq(creatives.adAccountAssetId, asset.id)),
    ).toHaveLength(0);
    const [audit] = await auditRows(wid, "meta.connection.disconnect");
    expect(audit).toMatchObject({ actorUserId: owner.id, result: "ok" });
    expect(JSON.parse(audit!.detail!)).toEqual({
      connectionId: connection.id,
      businessId: connection.metaBusinessId,
      revoked: true,
    });
    expect(JSON.stringify(audit)).not.toContain(TOKEN);
  });

  it.each([
    ["a Meta error", () => metaFails("me/permissions", sessionFixture)],
    ["a Meta outage", () => metaServerError("me/permissions")],
    ["a network failure", () => metaNetworkError("me/permissions")],
    ["success false", () => metaReplies("me/permissions", { success: false })],
  ])(
    "still deletes everything when Meta answers with %s",
    async (_name, handler) => {
      const { wid, owner, connection } = await seedConnectionWithData();
      server.use(handler());

      const response = await disconnect(wid, connection.id, owner);

      expect(response.status).toBe(204);
      expect(await connectionRows(wid)).toHaveLength(0);
      expect(await assetRows(wid)).toHaveLength(0);
      const [audit] = await auditRows(wid, "meta.connection.disconnect");
      expect(JSON.parse(audit!.detail!)).toMatchObject({ revoked: false });
    },
  );

  it("still deletes when the stored token cannot be decrypted", async () => {
    const { wid, owner } = await setup();
    const sealedWithUnknownKey = await createMetaConnection(
      keyEnv,
      wid,
      TOKEN,
      { tokenKeyVersion: 99 },
    );
    const requests = captureRequests();

    const response = await disconnect(wid, sealedWithUnknownKey.id, owner);

    expect(response.status).toBe(204);
    expect(requests).toHaveLength(0);
    expect((await connectionRows(wid)).map(({ id }) => id)).not.toContain(
      sealedWithUnknownKey.id,
    );
  });

  it("deletes a connection that already needs reconnecting", async () => {
    const { wid, owner } = await setup();
    const stale = await createMetaConnection(keyEnv, wid, TOKEN, {
      status: "reconnect_required",
    });
    serveRevoke();

    const response = await disconnect(wid, stale.id, owner);

    expect(response.status).toBe(204);
    expect((await connectionRows(wid)).map(({ id }) => id)).not.toContain(
      stale.id,
    );
  });

  it.each([{}, { confirm: false }, { confirm: "true" }])(
    "rejects the body %j with 400 and keeps the connection",
    async (body) => {
      const { wid, owner, connection } = await setup();

      await expectError(
        await disconnect(wid, connection.id, owner, body),
        400,
        "VALIDATION",
      );

      expect(await connectionRows(wid)).toHaveLength(1);
      expect(connection.id).toBe((await connectionRows(wid))[0]!.id);
    },
  );

  it("answers 404 for an unknown connection", async () => {
    const { wid, owner } = await setup();

    await expectError(
      await disconnect(wid, "missing", owner),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 404 and leaves another workspace's connection alone", async () => {
    const { wid, owner } = await setup();
    const other = await setup();
    const requests = captureRequests();

    await expectError(
      await disconnect(wid, other.connection.id, owner),
      404,
      "NOT_FOUND",
    );

    expect(requests).toHaveLength(0);
    expect(await connectionRows(other.wid)).toHaveLength(1);
  });
});
