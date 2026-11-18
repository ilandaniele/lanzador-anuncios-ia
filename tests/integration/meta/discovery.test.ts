import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { discoverAssets } from "../../../src/api/integrations/meta/read";
import type { Scope } from "../../../src/api/repositories/scope";
import { discoverConnectionAssets } from "../../../src/api/services/meta/discovery";
import { metaAssets } from "../../../src/db/schema/meta";
import adAccountsFixture from "../../fixtures/meta/adaccounts.json";
import accountsEmptyFixture from "../../fixtures/meta/accounts-empty.json";
import accountsFixture from "../../fixtures/meta/accounts.json";
import assignedPagesFixture from "../../fixtures/meta/assigned-pages.json";
import {
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
} from "../../helpers/factory";
import { captureRequests, graph } from "../../helpers/meta-graph";
import { metaEdgePages, metaMe, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const scopeFor = (workspaceId: string, userId: string): Scope => ({
  workspaceId,
  userId,
  role: "editor",
});

const serveDiscovery = () =>
  server.use(
    metaMe(),
    metaReplies("me/adaccounts", adAccountsFixture),
    metaReplies("me/accounts", accountsFixture),
  );

const serveAdAccounts = (data: unknown[]) =>
  server.use(metaReplies("me/adaccounts", { data }));

const readAssets = (workspaceId: string) =>
  drizzle(env.DB)
    .select()
    .from(metaAssets)
    .where(eq(metaAssets.workspaceId, workspaceId));

const byMetaId = async (workspaceId: string, metaId: string) => {
  const [row] = await drizzle(env.DB)
    .select()
    .from(metaAssets)
    .where(
      and(
        eq(metaAssets.workspaceId, workspaceId),
        eq(metaAssets.metaId, metaId),
      ),
    );
  return row!;
};

async function discoveringWorkspace() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, "token");
  const scope = scopeFor(workspace.id, owner.id);
  const discover = () =>
    discoverConnectionAssets(env.DB, scope, graph(), connection.id);
  return { workspace, scope, connection, discover };
}

const numberedAccounts = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `act_${from + index}`,
    name: `Cuenta ${from + index}`,
  }));

const pageOf = (accounts: unknown[], index: number) => ({
  data: accounts,
  paging: { cursors: { after: `cursor_${index + 1}` } },
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe("discoverAssets", () => {
  it("lists ad accounts, pixels, pages and instagram with their parents", async () => {
    serveDiscovery();

    const { assets, user } = await discoverAssets(graph());

    expect(user.id).toBe("100000000000001");
    expect(
      assets.map(({ kind, metaId, parentMetaId }) => [
        kind,
        metaId,
        parentMetaId,
      ]),
    ).toEqual([
      ["ad_account", "act_1001", null],
      ["pixel", "7001", "act_1001"],
      ["pixel", "7002", "act_1001"],
      ["ad_account", "act_1002", null],
      ["page", "9001", null],
      ["instagram", "17841400000001", "9001"],
      ["page", "9002", null],
    ]);
    expect(assets[0]).toMatchObject({
      name: "Cuenta Principal",
      currency: "ARS",
      timezoneName: "America/Argentina/Buenos_Aires",
      accountStatus: 1,
    });
    expect(assets[5]?.name).toBe("tienda_demo");
  });

  it("falls back to me/assigned_pages when me/accounts is empty", async () => {
    serveDiscovery();
    server.use(
      metaReplies("me/accounts", accountsEmptyFixture),
      metaReplies("me/assigned_pages", assignedPagesFixture),
    );

    const { assets } = await discoverAssets(graph());

    expect(assets.filter(({ kind }) => kind === "page")).toEqual([
      expect.objectContaining({ metaId: "9003", name: "Pagina Asignada" }),
    ]);
  });

  it("takes business_id from the business_management granular scope", async () => {
    serveDiscovery();

    const result = await discoverAssets(graph(), [
      { scope: "ads_management", target_ids: ["1"] },
      { scope: "business_management", target_ids: ["555000111"] },
    ]);

    expect(result).toMatchObject({
      businessId: "555000111",
      businessName: "Negocio Demo",
    });
  });

  it("uses the granular scope id even when no account lists that business", async () => {
    serveDiscovery();

    const result = await discoverAssets(graph(), [
      { scope: "business_management", target_ids: ["999"] },
    ]);

    expect(result).toMatchObject({ businessId: "999", businessName: null });
  });

  it("falls back to the business of the ad accounts", async () => {
    serveDiscovery();

    const result = await discoverAssets(graph(), []);

    expect(result).toMatchObject({
      businessId: "555000111",
      businessName: "Negocio Demo",
    });
  });

  it("returns no business when nothing identifies it", async () => {
    serveDiscovery();
    serveAdAccounts([{ id: "act_1", name: "Sin negocio" }]);

    const result = await discoverAssets(graph());

    expect(result).toMatchObject({ businessId: null, businessName: null });
  });

  it("follows the cursor across pages until a short page", async () => {
    serveDiscovery();
    server.use(
      metaEdgePages("me/adaccounts", [
        pageOf(numberedAccounts(0, 100), 0),
        pageOf(numberedAccounts(100, 100), 1),
        pageOf(numberedAccounts(200, 50), 2),
      ]),
    );
    const requests = captureRequests();

    const { assets } = await discoverAssets(graph());

    expect(assets.filter(({ kind }) => kind === "ad_account")).toHaveLength(
      250,
    );
    const edgeRequests = requests.filter((request) =>
      request.url.includes("/me/adaccounts"),
    );
    expect(
      edgeRequests.map((request) =>
        new URL(request.url).searchParams.get("after"),
      ),
    ).toEqual([null, "cursor_1", "cursor_2"]);
  });

  it("caps each edge at 500 items", async () => {
    serveDiscovery();
    server.use(
      metaEdgePages(
        "me/adaccounts",
        Array.from({ length: 8 }, (_, index) =>
          pageOf(numberedAccounts(index * 100, 100), index),
        ),
      ),
    );
    const requests = captureRequests();

    const { assets } = await discoverAssets(graph());

    expect(assets.filter(({ kind }) => kind === "ad_account")).toHaveLength(
      500,
    );
    expect(
      requests.filter((request) => request.url.includes("/me/adaccounts")),
    ).toHaveLength(5);
  });

  it("stops when a full page carries no cursor", async () => {
    serveDiscovery();
    serveAdAccounts(numberedAccounts(0, 100));

    const { assets } = await discoverAssets(graph());

    expect(assets.filter(({ kind }) => kind === "ad_account")).toHaveLength(
      100,
    );
  });

  it("rejects an invalid payload", async () => {
    serveDiscovery();
    server.use(metaReplies("me/adaccounts", { data: [{ id: 1 }] }));

    await expect(discoverAssets(graph())).rejects.toMatchObject({
      kind: "transient",
    });
  });
});

describe("discoverConnectionAssets", () => {
  it("inserts ad accounts, pixels, pages and instagram linked to its page", async () => {
    serveDiscovery();
    const { workspace, connection, discover } = await discoveringWorkspace();

    const result = await discover();

    expect(result).toEqual({
      businessId: "555000111",
      businessName: "Negocio Demo",
      assetCount: 7,
    });
    const rows = await readAssets(workspace.id);
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.connectionId === connection.id)).toBe(true);
    expect(rows.every((row) => row.enabled === 0)).toBe(true);
    expect(rows.every((row) => row.missingSince === null)).toBe(true);
    expect(await byMetaId(workspace.id, "17841400000001")).toMatchObject({
      kind: "instagram",
      parentMetaId: "9001",
      name: "tienda_demo",
    });
    expect(await byMetaId(workspace.id, "7001")).toMatchObject({
      kind: "pixel",
      parentMetaId: "act_1001",
    });
    expect(await byMetaId(workspace.id, "act_1002")).toMatchObject({
      kind: "ad_account",
      currency: "USD",
      accountStatus: 2,
    });
  });

  it("marks missing_since on assets Meta stopped returning and keeps the rest null", async () => {
    serveDiscovery();
    const { workspace, discover } = await discoveringWorkspace();
    await discover();
    serveAdAccounts([adAccountsFixture.data[0]]);

    await discover();

    expect((await byMetaId(workspace.id, "act_1002")).missingSince).toEqual(
      expect.any(Number),
    );
    const kept = (await readAssets(workspace.id)).filter(
      (row) => row.metaId !== "act_1002",
    );
    expect(kept).toHaveLength(6);
    expect(kept.every((row) => row.missingSince === null)).toBe(true);
  });

  it("keeps the first missing_since while an asset stays missing", async () => {
    serveDiscovery();
    const { workspace, discover } = await discoveringWorkspace();
    await discover();
    serveAdAccounts([adAccountsFixture.data[0]]);
    await discover();
    const first = (await byMetaId(workspace.id, "act_1002")).missingSince;

    await discover();

    expect((await byMetaId(workspace.id, "act_1002")).missingSince).toBe(first);
  });

  it("clears missing_since when the asset reappears and keeps the enabled choice", async () => {
    serveDiscovery();
    const { workspace, discover } = await discoveringWorkspace();
    await discover();
    await drizzle(env.DB)
      .update(metaAssets)
      .set({ enabled: 1 })
      .where(eq(metaAssets.metaId, "act_1002"));
    serveAdAccounts([adAccountsFixture.data[0]]);
    await discover();
    serveDiscovery();

    await discover();

    expect(await byMetaId(workspace.id, "act_1002")).toMatchObject({
      missingSince: null,
      enabled: 1,
    });
  });

  it("leaves assets of another workspace and of another connection untouched", async () => {
    serveDiscovery();
    const { workspace, connection, discover } = await discoveringWorkspace();
    const otherWorkspace = await createWorkspace();
    const otherWorkspaceConnection = await createMetaConnection(
      keyEnv,
      otherWorkspace.workspace.id,
      "token",
    );
    const foreign = await createMetaAsset(
      otherWorkspace.workspace.id,
      otherWorkspaceConnection.id,
    );
    const sibling = await createMetaConnection(keyEnv, workspace.id, "token");
    const siblingAsset = await createMetaAsset(workspace.id, sibling.id);
    expect(sibling.id).not.toBe(connection.id);

    await discover();

    expect(
      await byMetaId(otherWorkspace.workspace.id, foreign.metaId),
    ).toMatchObject({
      missingSince: null,
      updatedAt: foreign.updatedAt,
    });
    expect(await byMetaId(workspace.id, siblingAsset.metaId)).toMatchObject({
      missingSince: null,
      connectionId: sibling.id,
      updatedAt: siblingAsset.updatedAt,
    });
  });

  it("handles a discovery that finds nothing", async () => {
    serveDiscovery();
    const { workspace, discover } = await discoveringWorkspace();
    await discover();
    serveAdAccounts([]);
    server.use(metaReplies("me/accounts", accountsEmptyFixture));
    server.use(metaReplies("me/assigned_pages", accountsEmptyFixture));

    await discover();

    const rows = await readAssets(workspace.id);
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => typeof row.missingSince === "number")).toBe(
      true,
    );
  });
});
