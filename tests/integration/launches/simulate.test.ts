import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { DAY_MS } from "../../../src/api/lib/time";
import { plans } from "../../../src/db/schema/auth";
import { launches } from "../../../src/db/schema/launches";
import { workspaces } from "../../../src/db/schema/workspaces";
import { products } from "../../../src/db/schema/products";
import { metaAssets } from "../../../src/db/schema/meta";
import { creatives } from "../../../src/db/schema/creatives";
import { launchPlanSchema } from "../../../src/shared/schemas/launch";
import sessionFixture from "../../fixtures/meta/error-session.json";
import {
  api,
  createCreative,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createProduct,
  expectError,
} from "../../helpers/factory";
import { captureRequests } from "../../helpers/meta-graph";
import { GRAPH_VERSION, metaFails, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
} from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABsimulateRouteToken123";
const ACCOUNT_META_ID = "act_555";
const CAMPAIGN_ID = "120200000000000100";
const DRAFT_AT = Date.UTC(2026, 2, 5, 15, 30);
const MEDIA_NOT_IN_ACCOUNT_TEXT = "Volvé a subirlo para esta cuenta";

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
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;
type Draft = Record<string, unknown>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: routeEnv, method: "POST", ...options });

const simulatePath = (workspaceId: string, launchId: string) =>
  `/api/w/${workspaceId}/launches/${launchId}/simulate`;

const videoCreative = {
  kind: "video" as const,
  contentType: "video/mp4",
  metaVideoId: "video-1",
  metaImageHash: null,
};

const healthyAccount = (overrides: Draft = {}) =>
  metaReplies(ACCOUNT_META_ID, {
    id: ACCOUNT_META_ID,
    account_status: 1,
    currency: "USD",
    ...overrides,
  });

const adset = (id: string, overrides: Draft = {}) => ({
  id,
  name: `CONJ ${id}`,
  effective_status: "ACTIVE",
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  promoted_object: { pixel_id: "pixel-1", custom_event_type: "PURCHASE" },
  targeting: { geo_locations: { countries: ["AR"] }, age_min: 25 },
  ...overrides,
});

const campaignReference = (adsets: Draft[], overrides: Draft = {}) =>
  metaReplies(CAMPAIGN_ID, {
    id: CAMPAIGN_ID,
    account_id: "555",
    daily_budget: "8000",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    adsets: { data: adsets },
    ...overrides,
  });

const cloneItem = (position: number, overrides: Draft = {}) => ({
  source: "clone",
  cloneAdId: `ad-${position}`,
  cloneStoryId: `page-1_${position}`,
  adName: `Clon ${position}`,
  mediaKind: "image",
  ...overrides,
});

afterEach(() => {
  server.events.removeAllListeners();
});

async function setup(draftOverrides: Draft = {}) {
  const { workspace, users } = await seedWorkspaceWithRoles();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const account = await createMetaAsset(workspace.id, connection.id, {
    metaId: ACCOUNT_META_ID,
  });
  const product = await createProduct(workspace.id, { name: "Gorra" });
  const creative = await createCreative(
    workspace.id,
    account.id,
    videoCreative,
  );
  const draft = {
    adAccountAssetId: account.id,
    pixelId: "pixel-1",
    pageId: "page-1",
    mode: "new_cbo",
    productId: product.id,
    copy: {
      primaryText: "Comodas y livianas",
      headline: "Zapatillas urbanas",
      description: "Envio gratis",
      cta: "SHOP_NOW",
    },
    items: [
      {
        source: "upload",
        creativeId: creative.id,
        adName: "Anuncio 1",
        mediaKind: "image",
      },
    ],
    dailyBudgetMinor: 2000,
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    countries: ["AR"],
    optimizationEvent: "PURCHASE",
    campaignName: "CBO {fecha} {producto}",
    adsetName: "CONJ {n}",
    ...draftOverrides,
  };
  const launch = await createLaunch(workspace.id, {
    draft: JSON.stringify(draft),
    updatedAt: DRAFT_AT,
  });
  server.use(healthyAccount());
  return {
    wid: workspace.id,
    editor: users.editor,
    viewer: users.viewer,
    account,
    product,
    creative,
    launch,
    draft,
  };
}

const simulate = async (
  context: Awaited<ReturnType<typeof setup>>,
  options: Caller = {},
) =>
  call(simulatePath(context.wid, context.launch.id), {
    as: context.editor,
    ...options,
  });

const planOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return launchPlanSchema.parse(await response.json());
};

const blockerCodes = async (context: Awaited<ReturnType<typeof setup>>) =>
  (await planOf(await simulate(context))).blockers.map(({ code }) => code);

const rowOf = (id: string) =>
  db
    .select()
    .from(launches)
    .where(eq(launches.id, id))
    .then(([row]) => row);

describe("POST /api/w/:wid/launches/:id/simulate", () => {
  it("returns 401 without a session", async () => {
    const context = await setup();

    await expectError(
      await simulate(context, { as: undefined }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 403 to a viewer", async () => {
    const context = await setup();

    await expectError(
      await simulate(context, { as: context.viewer }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 404 for an unknown launch", async () => {
    const context = await setup();

    await expectError(
      await call(simulatePath(context.wid, "missing"), { as: context.editor }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for a launch of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(simulatePath(A.workspace.id, B.launch.id), {
        as: A.users.editor,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 409 NOT_EDITABLE once the launch is queued", async () => {
    const context = await setup();
    await db
      .update(launches)
      .set({ status: "queued" })
      .where(eq(launches.id, context.launch.id));

    await expectError(await simulate(context), 409, "NOT_EDITABLE");
  });

  it("returns 422 BLOCKERS with the fields of an incomplete draft", async () => {
    const context = await setup();
    await db
      .update(launches)
      .set({ draft: JSON.stringify({ campaignName: "CBO" }) })
      .where(eq(launches.id, context.launch.id));

    const response = await simulate(context);

    await expectError(response, 422, "BLOCKERS");
  });

  it("returns 409 META_RECONNECT_REQUIRED on a session error", async () => {
    const context = await setup();
    server.use(metaFails(ACCOUNT_META_ID, sessionFixture));

    await expectError(await simulate(context), 409, "META_RECONNECT_REQUIRED");
  });

  it("returns 502 META_ERROR on other Meta errors", async () => {
    const context = await setup();
    server.use(
      metaFails(ACCOUNT_META_ID, { error: { code: 100, message: "bad" } }),
    );

    await expectError(await simulate(context), 502, "META_ERROR");
  });

  it("stores the plan, moves to simulated and renders the name templates", async () => {
    const context = await setup();

    const plan = await planOf(await simulate(context));

    expect(plan).toMatchObject({
      campaign: {
        name: "CBO 05-03 Gorra",
        dailyBudgetMinor: 2000,
        bidStrategy: "LOWEST_COST_WITHOUT_CAP",
      },
      adset: { name: "CONJ 1", countries: ["AR"] },
      ads: [
        {
          position: 0,
          adName: "Anuncio 1",
          mediaKind: "video",
          link: "https://tienda.example.test/producto",
          pageId: "page-1",
          instagramUserId: null,
        },
      ],
      warnings: [],
      blockers: [],
    });
    const row = await rowOf(context.launch.id);
    expect(row?.status).toBe("simulated");
    expect(row?.planHash).toBe(plan.planHash);
    expect(JSON.parse(row?.plan ?? "null")).toEqual(
      JSON.parse(JSON.stringify(plan)),
    );
    expect(row?.updatedAt).toBe(DRAFT_AT);
  });

  it("returns the same planHash for the same draft", async () => {
    const context = await setup();

    const first = await planOf(await simulate(context));
    const second = await planOf(await simulate(context));

    expect(second.planHash).toBe(first.planHash);
  });

  it("changes the planHash when the draft changes", async () => {
    const first = await setup();
    const second = await setup({ dailyBudgetMinor: 2500 });

    const firstPlan = await planOf(await simulate(first));
    const secondPlan = await planOf(await simulate(second));

    expect(secondPlan.planHash).not.toBe(firstPlan.planHash);
  });

  it("only reads from Meta", async () => {
    const context = await setup();
    const requests = captureRequests();

    await planOf(await simulate(context));

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.map(({ method }) => method)).not.toContain("POST");
  });

  it("recomputes mediaKind from the creative instead of trusting the client", async () => {
    const context = await setup();

    const plan = await planOf(await simulate(context));

    expect(plan.ads[0]?.mediaKind).toBe("video");
  });
});

describe("simulate blockers", () => {
  it("blocks a budget above the workspace cap", async () => {
    const context = await setup({ dailyBudgetMinor: 30001 });

    expect(await blockerCodes(context)).toEqual(["BUDGET_CAP"]);
  });

  it("blocks a new_cbo launch without budget", async () => {
    const context = await setup({ dailyBudgetMinor: undefined });

    expect(await blockerCodes(context)).toEqual(["BUDGET_REQUIRED"]);
  });

  it("blocks COST_CAP without an amount", async () => {
    const context = await setup({ bidStrategy: "COST_CAP" });

    expect(await blockerCodes(context)).toEqual(["BID_AMOUNT_REQUIRED"]);
  });

  it("accepts COST_CAP with an amount", async () => {
    const context = await setup({
      bidStrategy: "COST_CAP",
      bidAmountMinor: 800,
    });

    expect(await blockerCodes(context)).toEqual([]);
  });

  it("blocks a product whose landing is in error", async () => {
    const context = await setup();
    await db
      .update(products)
      .set({ landingStatus: "error" })
      .where(eq(products.id, context.product.id));

    expect(await blockerCodes(context)).toEqual(["LANDING_ERROR"]);
  });

  it("blocks an ad account that is not active", async () => {
    const context = await setup();
    server.use(healthyAccount({ account_status: 2 }));

    expect(await blockerCodes(context)).toEqual(["ACCOUNT_NOT_ELIGIBLE"]);
  });

  it("blocks an ad account that is not USD", async () => {
    const context = await setup();
    server.use(healthyAccount({ currency: "ARS" }));

    expect(await blockerCodes(context)).toEqual(["ACCOUNT_NOT_USD"]);
  });

  it("blocks a creative that is not ready", async () => {
    const context = await setup();
    await db
      .update(creatives)
      .set({ status: "processing" })
      .where(eq(creatives.id, context.creative.id));

    expect(await blockerCodes(context)).toEqual(["CREATIVE_NOT_READY"]);
  });

  it("blocks a creative uploaded to another ad account with MEDIA_NOT_IN_ACCOUNT", async () => {
    const context = await setup();
    const connection = await createMetaConnection(
      keyEnv,
      context.wid,
      "other-token",
    );
    const otherAccount = await createMetaAsset(context.wid, connection.id, {
      metaId: "act_999",
    });
    await db
      .update(creatives)
      .set({ adAccountAssetId: otherAccount.id })
      .where(eq(creatives.id, context.creative.id));

    const plan = await planOf(await simulate(context));

    expect(plan.blockers).toEqual([
      {
        code: "MEDIA_NOT_IN_ACCOUNT",
        text: `Anuncio 1: ${MEDIA_NOT_IN_ACCOUNT_TEXT}`,
      },
    ]);
  });

  it("blocks a creative of another workspace", async () => {
    const context = await setup();
    const { B } = await seedTenantPair();
    const draft = {
      ...context.draft,
      items: [
        {
          source: "upload",
          creativeId: B.creative.id,
          adName: "Ajeno",
          mediaKind: "image",
        },
      ],
    };
    await db
      .update(launches)
      .set({ draft: JSON.stringify(draft) })
      .where(eq(launches.id, context.launch.id));

    expect(await blockerCodes(context)).toEqual(["CREATIVE_NOT_FOUND"]);
  });

  it("blocks an upload item without a creative", async () => {
    const context = await setup({
      items: [{ source: "upload", adName: "Sin creativo" }],
    });

    expect(await blockerCodes(context)).toEqual(["CREATIVE_REQUIRED"]);
  });

  it("blocks more items than the plan allows", async () => {
    const context = await setup({ items: [cloneItem(1), cloneItem(2)] });
    await db
      .insert(plans)
      .values({
        id: "tiny",
        name: "Tiny",
        maxMembers: 1,
        maxAdAccounts: 1,
        maxCreativesPerLaunch: 1,
        aiDailyNeurons: 1,
        aiMonthlyNeurons: 1,
        priceMonthlyMinor: 0,
        currency: "USD",
        isActive: 0,
        createdAt: 1,
      })
      .onConflictDoNothing();
    await db
      .update(workspaces)
      .set({ planId: "tiny", trialEndsAt: Date.now() + DAY_MS })
      .where(eq(workspaces.id, context.wid));

    expect(await blockerCodes(context)).toEqual(["TOO_MANY_ITEMS"]);
  });

  it("blocks mixing a video and an image creative", async () => {
    const context = await setup();
    const image = await createCreative(context.wid, context.account.id);
    const items = [
      ...(context.draft.items as Draft[]),
      { source: "upload", creativeId: image.id, adName: "Imagen" },
    ];
    await db
      .update(launches)
      .set({ draft: JSON.stringify({ ...context.draft, items }) })
      .where(eq(launches.id, context.launch.id));

    expect(await blockerCodes(context)).toEqual(["MIXED_MEDIA"]);
  });

  it("blocks a clone item without a source post", async () => {
    const context = await setup({
      items: [cloneItem(1, { cloneStoryId: undefined })],
    });

    expect(await blockerCodes(context)).toEqual(["CLONE_SOURCE_REQUIRED"]);
  });

  it("blocks a clone item without a media kind", async () => {
    const context = await setup({
      items: [cloneItem(1, { mediaKind: undefined })],
    });

    expect(await blockerCodes(context)).toEqual(["MEDIA_KIND_REQUIRED"]);
  });

  it("blocks a clone item whose post belongs to another page", async () => {
    const context = await setup({
      items: [cloneItem(1, { cloneStoryId: "page-9_1" })],
    });

    expect(await blockerCodes(context)).toEqual(["CLONE_OTHER_PAGE"]);
  });
});

describe("simulate with an existing campaign", () => {
  const existing = { mode: "existing_cbo", existingCampaignId: CAMPAIGN_ID };

  it("maps the newest adset as reference and numbers the new one", async () => {
    const context = await setup(existing);
    server.use(
      campaignReference([adset("120200000000000201"), adset("999")], {}),
    );

    const plan = await planOf(await simulate(context));

    expect(plan.campaign).toBeUndefined();
    expect(plan.adset.name).toBe("CONJ 3");
    expect(plan.blockers).toEqual([]);
  });

  it("blocks without a campaign id", async () => {
    const context = await setup({ mode: "existing_cbo" });

    expect(await blockerCodes(context)).toEqual(["CAMPAIGN_REQUIRED"]);
  });

  it("blocks a campaign without a campaign budget", async () => {
    const context = await setup(existing);
    server.use(
      campaignReference([adset("120200000000000201")], {
        daily_budget: undefined,
      }),
    );

    expect(await blockerCodes(context)).toEqual(["NOT_CBO"]);
  });

  it("blocks a campaign without live adsets", async () => {
    const context = await setup(existing);
    server.use(campaignReference([]));

    expect(await blockerCodes(context)).toEqual(["NO_REFERENCE_ADSET"]);
  });

  it("blocks a reference adset missing its billing event", async () => {
    const context = await setup(existing);
    server.use(
      campaignReference([
        adset("120200000000000201", { billing_event: undefined }),
      ]),
    );

    expect(await blockerCodes(context)).toEqual(["NO_REFERENCE_ADSET"]);
  });

  it("returns 404 for a campaign of another ad account", async () => {
    const context = await setup(existing);
    server.use(
      campaignReference([adset("120200000000000201")], { account_id: "999" }),
    );

    await expectError(await simulate(context), 404, "NOT_FOUND");
  });
});

describe("simulate warnings", () => {
  it("warns about more than 10 ads in one ad set", async () => {
    const items = Array.from({ length: 11 }, (_, index) =>
      cloneItem(index + 1),
    );
    const context = await setup({ items });

    const plan = await planOf(await simulate(context));

    expect(plan.blockers).toEqual([]);
    expect(plan.warnings.map(({ code }) => code)).toEqual([
      "TOO_MANY_PER_ADSET",
    ]);
  });

  it("warns about a horizontal video through format_warning", async () => {
    const context = await setup();
    await db
      .update(creatives)
      .set({ formatWarning: "horizontal" })
      .where(eq(creatives.id, context.creative.id));

    const plan = await planOf(await simulate(context));

    expect(plan.blockers).toEqual([]);
    expect(plan.warnings.map(({ code }) => code)).toEqual(["HORIZONTAL_VIDEO"]);
  });
});

describe("simulate bookkeeping", () => {
  it("keeps the previous status when the ad account row is gone", async () => {
    const context = await setup();
    await db
      .update(metaAssets)
      .set({ enabled: 0 })
      .where(eq(metaAssets.id, context.account.id));

    await expectError(await simulate(context), 404, "NOT_FOUND");
    expect((await rowOf(context.launch.id))?.status).toBe("draft");
  });
});
