import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { launches } from "../../../src/db/schema/launches";
import {
  launchDetailResponseSchema,
  launchDraftSchema,
  launchesPageSchema,
  launchResponseSchema,
  partialLaunchDraftSchema,
} from "../../../src/shared/schemas/launch";
import {
  api,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createProduct,
  expectError,
} from "../../helpers/factory";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
} from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

const launchesPath = (workspaceId: string, suffix = "") =>
  `/api/w/${workspaceId}/launches${suffix}`;

const fullDraft = {
  adAccountAssetId: "asset-1",
  pixelId: "pixel-1",
  pageId: "page-1",
  mode: "new_cbo",
  productId: "product-1",
  copy: {
    primaryText: "Comodas y livianas",
    headline: "Zapatillas urbanas",
    description: "Envio gratis",
    cta: "SHOP_NOW",
  },
  items: [
    { source: "upload", creativeId: "c1", adName: "Anuncio 1" },
    { source: "upload", creativeId: "c2", adName: "Anuncio 2" },
  ],
  dailyBudgetMinor: 2000,
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  countries: ["AR"],
  optimizationEvent: "PURCHASE",
  campaignName: "CBO 05-03",
  adsetName: "CONJ 1",
};

const itemOf = (mediaKind: string, position: number) => ({
  source: "upload",
  creativeId: `c${position}`,
  adName: `Anuncio ${position}`,
  mediaKind,
});

const rowOf = (id: string) =>
  db
    .select()
    .from(launches)
    .where(eq(launches.id, id))
    .then(([row]) => row);

const seedAccount = async (workspaceId: string) => {
  const connection = await createMetaConnection(env, workspaceId, "token");
  return createMetaAsset(workspaceId, connection.id, {
    name: "Cuenta Uno",
    metaId: "act_123456",
  });
};

describe("launch draft schemas", () => {
  it("accepts a complete draft", () => {
    expect(launchDraftSchema.safeParse(fullDraft).success).toBe(true);
  });

  it("accepts a complete draft whose copy has no description", () => {
    const copy = { ...fullDraft.copy, description: undefined };
    expect(launchDraftSchema.safeParse({ ...fullDraft, copy }).success).toBe(
      true,
    );
  });

  it.each([
    ["an empty draft", {}],
    ["only a campaign name", { campaignName: "CBO" }],
    ["a partial copy", { copy: { headline: "Hola" } }],
    ["no items yet", { items: [] }],
  ])("accepts a partial draft with %s", (_, draft) => {
    expect(partialLaunchDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects a complete draft mixing video and image", () => {
    const result = launchDraftSchema.safeParse({
      ...fullDraft,
      items: [itemOf("video", 1), itemOf("image", 2)],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["items"]);
  });

  it("accepts a complete draft with only one media kind", () => {
    expect(
      launchDraftSchema.safeParse({
        ...fullDraft,
        items: [itemOf("video", 1), itemOf("video", 2)],
      }).success,
    ).toBe(true);
  });

  it("rejects a partial draft mixing video and image", () => {
    expect(
      partialLaunchDraftSchema.safeParse({
        items: [itemOf("video", 1), itemOf("image", 2)],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["no items", { items: [] }],
    ["lowercase countries", { countries: ["ar"] }],
    ["an unknown mode", { mode: "abo" }],
    ["a non-PURCHASE event", { optimizationEvent: "LEAD" }],
    ["a negative budget", { dailyBudgetMinor: -1 }],
  ])("rejects a complete draft with %s", (_, override) => {
    expect(
      launchDraftSchema.safeParse({ ...fullDraft, ...override }).success,
    ).toBe(false);
  });
});

describe("POST /api/w/:wid/launches", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id), {
        method: "POST",
        body: { draft: {} },
      }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 403 to a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id), {
        as: users.viewer,
        method: "POST",
        body: { draft: {} },
      }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("creates a draft from a partial draft", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(launchesPath(workspace.id), {
      as: users.editor,
      method: "POST",
      body: { draft: { campaignName: "CBO 05-03" } },
    });

    expect(response.status).toBe(201);
    const { launch } = launchResponseSchema.parse(await response.json());
    expect(launch).toMatchObject({
      status: "draft",
      source: "manual",
      mode: null,
      draft: { campaignName: "CBO 05-03" },
      createdBy: users.editor.id,
      metaCampaignUrl: null,
    });
    expect((await rowOf(launch.id))?.workspaceId).toBe(workspace.id);
  });

  it("keeps the top ads source of a draft", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    const response = await call(launchesPath(workspace.id), {
      as: users.editor,
      method: "POST",
      body: { draft: {}, source: "top_ads" },
    });

    expect(response.status).toBe(201);
    const { launch } = launchResponseSchema.parse(await response.json());
    expect(launch.source).toBe("top_ads");
  });

  it("rejects a source the client cannot set", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id), {
        as: users.editor,
        method: "POST",
        body: { draft: {}, source: "pilot" },
      }),
      400,
      "VALIDATION",
    );
  });

  it("copies product, account, currency and budget from the draft", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const product = await createProduct(workspace.id);
    const account = await seedAccount(workspace.id);

    const response = await call(launchesPath(workspace.id), {
      as: users.editor,
      method: "POST",
      body: {
        draft: {
          productId: product.id,
          adAccountAssetId: account.id,
          mode: "new_cbo",
          dailyBudgetMinor: 2000,
        },
      },
    });

    const { launch } = launchResponseSchema.parse(await response.json());
    expect(launch).toMatchObject({
      productId: product.id,
      adAccountAssetId: account.id,
      currency: "USD",
      mode: "new_cbo",
      dailyBudgetMinor: 2000,
    });
    expect((await rowOf(launch.id))?.adAccountMetaId).toBe("act_123456");
  });

  it("rejects an invalid draft with 400", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id), {
        as: users.editor,
        method: "POST",
        body: { draft: { countries: ["argentina"] } },
      }),
      400,
      "VALIDATION",
    );
  });

  it("rejects a draft mixing video and image with 400", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id), {
        as: users.editor,
        method: "POST",
        body: { draft: { items: [itemOf("video", 1), itemOf("image", 2)] } },
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 404 for a product of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(launchesPath(A.workspace.id), {
        as: A.users.editor,
        method: "POST",
        body: { draft: { productId: B.product.id } },
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an ad account of another workspace", async () => {
    const { A, B } = await seedTenantPair();
    const foreignAccount = await seedAccount(B.workspace.id);

    await expectError(
      await call(launchesPath(A.workspace.id), {
        as: A.users.editor,
        method: "POST",
        body: { draft: { adAccountAssetId: foreignAccount.id } },
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("GET /api/w/:wid/launches", () => {
  it("returns 401 without a session", async () => {
    const { workspace } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("lists only the workspace's launches, newest first, with names and URL", async () => {
    const { A, B } = await seedTenantPair();
    const product = await createProduct(A.workspace.id, { name: "Gorra" });
    const account = await seedAccount(A.workspace.id);
    const older = await createLaunch(A.workspace.id, { createdAt: 1000 });
    const newer = await createLaunch(A.workspace.id, {
      createdAt: 2000,
      status: "paused_verified",
      productId: product.id,
      adAccountAssetId: account.id,
      adAccountMetaId: "act_123456",
      metaCampaignId: "555",
      draft: JSON.stringify({ campaignName: "CBO 05-03" }),
      itemsTotal: 3,
      itemsDone: 2,
      itemsFailed: 1,
    });

    const response = await call(launchesPath(A.workspace.id), {
      as: A.users.viewer,
    });

    const page = launchesPageSchema.parse(await response.json());
    expect(page.data.map((item) => item.id)).toEqual([
      A.launch.id,
      newer.id,
      older.id,
    ]);
    expect(page.data.map((item) => item.id)).not.toContain(B.launch.id);
    expect(page.data[1]).toEqual({
      id: newer.id,
      status: "paused_verified",
      source: "manual",
      productName: "Gorra",
      adAccountName: "Cuenta Uno",
      campaignName: "CBO 05-03",
      itemsTotal: 3,
      itemsDone: 2,
      itemsFailed: 1,
      metaCampaignUrl:
        "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&selected_campaign_ids=555",
      createdBy: null,
      createdAt: new Date(2000).toISOString(),
    });
  });

  it("filters by status", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    await createLaunch(workspace.id);
    const done = await createLaunch(workspace.id, { status: "active" });

    const response = await call(launchesPath(workspace.id, "?status=active"), {
      as: users.viewer,
    });

    const page = launchesPageSchema.parse(await response.json());
    expect(page.data.map((item) => item.id)).toEqual([done.id]);
  });

  it("rejects an unknown status", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id, "?status=bogus"), {
        as: users.viewer,
      }),
      400,
      "VALIDATION",
    );
  });

  it("paginates without repeats or gaps", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const created = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => createLaunch(workspace.id, { createdAt: n })),
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : "";
      const response = await call(
        launchesPath(workspace.id, `?limit=2${query}`),
        { as: users.viewer },
      );
      const page = launchesPageSchema.parse(await response.json());
      seen.push(...page.data.map((item) => item.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual(created.map((launch) => launch.id).reverse());
  });

  it("rejects a limit above the maximum and an invalid cursor", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id, "?limit=101"), {
        as: users.viewer,
      }),
      400,
      "VALIDATION",
    );
    await expectError(
      await call(launchesPath(workspace.id, "?cursor=not-a-cursor"), {
        as: users.viewer,
      }),
      400,
      "VALIDATION",
    );
  });
});

describe("GET /api/w/:wid/launches/:id", () => {
  it("returns 401 without a session", async () => {
    const { A } = await seedTenantPair();

    await expectError(
      await call(launchesPath(A.workspace.id, `/${A.launch.id}`)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns the launch with items, checks and plan", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const plan = {
      adset: {
        name: "CONJ 1",
        countries: ["AR"],
        optimizationEvent: "PURCHASE",
      },
      ads: [],
      warnings: [],
      blockers: [],
      planHash: "abc",
    };
    const launch = await createLaunch(workspace.id, {
      status: "simulated",
      plan: JSON.stringify(plan),
      planHash: "abc",
      checks: JSON.stringify([{ ok: true, code: "PAUSED", text: "Pausado" }]),
      checksOk: 1,
    });

    const response = await call(launchesPath(workspace.id, `/${launch.id}`), {
      as: users.viewer,
    });

    expect(response.status).toBe(200);
    const detail = launchDetailResponseSchema.parse(await response.json());
    expect(detail.launch).toMatchObject({
      id: launch.id,
      status: "simulated",
      planHash: "abc",
      checksOk: true,
    });
    expect(detail.plan).toEqual(plan);
    expect(detail.checks).toEqual([
      { ok: true, code: "PAUSED", text: "Pausado" },
    ]);
    expect(detail.items).toEqual([]);
  });

  it("does not expose internal columns", async () => {
    const { A } = await seedTenantPair();

    const response = await call(
      launchesPath(A.workspace.id, `/${A.launch.id}`),
      { as: A.users.viewer },
    );

    const { launch } = launchDetailResponseSchema.parse(await response.json());
    for (const key of ["workspaceId", "workflowInstanceId", "attempt"]) {
      expect(launch).not.toHaveProperty(key);
    }
  });

  it("returns 404 for a launch of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(launchesPath(A.workspace.id, `/${B.launch.id}`), {
        as: A.users.owner,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(launchesPath(workspace.id, `/${crypto.randomUUID()}`), {
        as: users.viewer,
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("PATCH /api/w/:wid/launches/:id", () => {
  const patch = (
    workspaceId: string,
    id: string,
    as: Caller["as"],
    body: unknown,
  ) => call(launchesPath(workspaceId, `/${id}`), { as, method: "PATCH", body });

  it("returns 401 without a session and 403 to a viewer", async () => {
    const { A } = await seedTenantPair();

    await expectError(
      await patch(A.workspace.id, A.launch.id, undefined, { draft: {} }),
      401,
      "UNAUTHENTICATED",
    );
    await expectError(
      await patch(A.workspace.id, A.launch.id, A.users.viewer, { draft: {} }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("replaces the draft of a draft launch", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id, {
      draft: JSON.stringify({ campaignName: "Viejo", adsetName: "Viejo" }),
    });

    const response = await patch(workspace.id, launch.id, users.editor, {
      draft: { campaignName: "Nuevo" },
    });

    expect(response.status).toBe(200);
    const body = launchResponseSchema.parse(await response.json());
    expect(body.launch.status).toBe("draft");
    expect(body.launch.draft).toEqual({ campaignName: "Nuevo" });
  });

  it("goes back to draft and drops the plan when it was simulated", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id, {
      status: "simulated",
      plan: JSON.stringify({}),
      planHash: "abc",
    });

    const response = await patch(workspace.id, launch.id, users.editor, {
      draft: { campaignName: "Cambio" },
    });

    expect(response.status).toBe(200);
    const row = await rowOf(launch.id);
    expect(row).toMatchObject({ status: "draft", plan: null, planHash: null });
  });

  it.each(["queued", "running", "paused_verified", "active", "discarded"])(
    "returns 409 NOT_EDITABLE for a %s launch and keeps it unchanged",
    async (status) => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const launch = await createLaunch(workspace.id, { status });

      await expectError(
        await patch(workspace.id, launch.id, users.editor, {
          draft: { campaignName: "Cambio" },
        }),
        409,
        "NOT_EDITABLE",
      );
      expect(await rowOf(launch.id)).toMatchObject({ status, draft: "{}" });
    },
  );

  it("rejects an invalid draft with 400", async () => {
    const { A } = await seedTenantPair();

    await expectError(
      await patch(A.workspace.id, A.launch.id, A.users.editor, {
        draft: { mode: "abo" },
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns 404 for a launch of another workspace and leaves it intact", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await patch(A.workspace.id, B.launch.id, A.users.owner, {
        draft: { campaignName: "Hijack" },
      }),
      404,
      "NOT_FOUND",
    );
    expect((await rowOf(B.launch.id))?.draft).toBe("{}");
  });

  it("returns 404 for a product of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await patch(A.workspace.id, A.launch.id, A.users.editor, {
        draft: { productId: B.product.id },
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("POST /api/w/:wid/launches/:id/discard", () => {
  const discard = (workspaceId: string, id: string, as: Caller["as"]) =>
    call(launchesPath(workspaceId, `/${id}/discard`), { as, method: "POST" });

  it("returns 401 without a session and 403 to a viewer", async () => {
    const { A } = await seedTenantPair();

    await expectError(
      await discard(A.workspace.id, A.launch.id, undefined),
      401,
      "UNAUTHENTICATED",
    );
    await expectError(
      await discard(A.workspace.id, A.launch.id, A.users.viewer),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it.each(["draft", "simulated"])(
    "discards a %s launch with 204",
    async (status) => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const launch = await createLaunch(workspace.id, { status });

      const response = await discard(workspace.id, launch.id, users.editor);

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect((await rowOf(launch.id))?.status).toBe("discarded");
    },
  );

  it.each(["queued", "paused_verified", "active", "discarded"])(
    "returns 409 NOT_EDITABLE for a %s launch",
    async (status) => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const launch = await createLaunch(workspace.id, { status });

      await expectError(
        await discard(workspace.id, launch.id, users.editor),
        409,
        "NOT_EDITABLE",
      );
      expect((await rowOf(launch.id))?.status).toBe(status);
    },
  );

  it("returns 404 for a launch of another workspace and leaves it intact", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await discard(A.workspace.id, B.launch.id, A.users.owner),
      404,
      "NOT_FOUND",
    );
    expect((await rowOf(B.launch.id))?.status).toBe("draft");
  });

  it("blocks a later patch on the discarded launch", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id);
    await discard(workspace.id, launch.id, users.editor);

    await expectError(
      await call(launchesPath(workspace.id, `/${launch.id}`), {
        as: users.editor,
        method: "PATCH",
        body: { draft: {} },
      }),
      409,
      "NOT_EDITABLE",
    );
  });
});
