import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { creatives } from "../../../src/db/schema/creatives";
import { launchItems, launches } from "../../../src/db/schema/launches";
import { auditLog } from "../../../src/db/schema/ops";
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
import { graphUrl, metaFails, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { seedWorkspaceWithRoles } from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const TOKEN = "EAABlaunchWorkflowToken123";
const ACCOUNT_META_ID = "act_555";
const DRAFT_AT = Date.UTC(2026, 2, 5, 15, 30);
const routeEnv = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;
type Context = Awaited<ReturnType<typeof setup>>;

const metaTime = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+0000");

const filteredName = (request: { url: string }) => {
  const filtering = new URL(request.url).searchParams.get("filtering");
  const [rule] = JSON.parse(filtering ?? "[]") as { value?: string }[];
  return rule?.value;
};

interface EdgeOptions {
  failFirstPost?: boolean;
  rejectName?: string;
}

function fakeEdge(edge: string, options: EdgeOptions = {}) {
  const objects: { id: string; name: string | null; created_time: string }[] =
    [];
  const posts: URLSearchParams[] = [];
  const path = `${ACCOUNT_META_ID}/${edge}`;
  server.use(
    http.get(graphUrl(path), ({ request }) =>
      HttpResponse.json({
        data: objects.filter(({ name }) => name === filteredName(request)),
      }),
    ),
    http.post(graphUrl(path), async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      if (options.rejectName && form.get("name") === options.rejectName) {
        return HttpResponse.json(
          {
            error: {
              message: "Invalid parameter",
              code: 100,
              error_user_title: "Texto rechazado",
              error_user_msg: "El texto no cumple las políticas",
            },
          },
          { status: 400 },
        );
      }
      posts.push(form);
      const id = `${edge}-${posts.length}`;
      objects.push({ id, name: form.get("name"), created_time: metaTime() });
      if (options.failFirstPost && posts.length === 1) {
        return new HttpResponse("upstream", { status: 500 });
      }
      return HttpResponse.json({ id });
    }),
  );
  return posts;
}

const fakeMeta = (options: Partial<Record<string, EdgeOptions>> = {}) => ({
  campaigns: fakeEdge("campaigns", options.campaigns),
  adsets: fakeEdge("adsets", options.adsets),
  adcreatives: fakeEdge("adcreatives", options.adcreatives),
  ads: fakeEdge("ads", options.ads),
});

const healthyAccount = () =>
  metaReplies(ACCOUNT_META_ID, {
    id: ACCOUNT_META_ID,
    account_status: 1,
    currency: "USD",
  });

afterEach(() => {
  server.events.removeAllListeners();
});

async function setup(itemCount = 7) {
  const { workspace, users } = await seedWorkspaceWithRoles();
  const connection = await createMetaConnection(env, workspace.id, TOKEN);
  const account = await createMetaAsset(workspace.id, connection.id, {
    metaId: ACCOUNT_META_ID,
  });
  const product = await createProduct(workspace.id, { name: "Gorra" });
  const images = await Promise.all(
    Array.from({ length: itemCount }, () =>
      createCreative(workspace.id, account.id),
    ),
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
    items: images.map((image, index) => ({
      source: "upload",
      creativeId: image.id,
      adName: `Anuncio ${index + 1}`,
      mediaKind: "image",
    })),
    dailyBudgetMinor: 2000,
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    countries: ["AR"],
    optimizationEvent: "PURCHASE",
    campaignName: "CBO {fecha} {producto}",
    adsetName: "CONJ {n}",
  };
  const launch = await createLaunch(workspace.id, {
    draft: JSON.stringify(draft),
    updatedAt: DRAFT_AT,
  });
  server.use(healthyAccount());
  return {
    wid: workspace.id,
    editor: users.editor,
    launch,
    images,
    draft,
    connection,
  };
}

const call = (context: Context, action: string, options: Caller = {}) =>
  api(app, `/api/w/${context.wid}/launches/${context.launch.id}/${action}`, {
    env: routeEnv,
    method: "POST",
    as: context.editor,
    ...options,
  });

async function simulate(context: Context) {
  const response = await call(context, "simulate");
  expect(response.status).toBe(200);
  return launchPlanSchema.parse(await response.json()).planHash;
}

const start = (context: Context, planHash: string) =>
  call(context, "start", { body: { confirm: true, planHash } });

const introspect = (context: Context) =>
  introspectWorkflowInstance(env.LAUNCH_WF, `launch-${context.launch.id}-1`);

async function startLaunch(
  context: Context,
  instance: Awaited<ReturnType<typeof introspect>>,
) {
  await instance.modify(async (m) => {
    await m.disableSleeps();
    await m.disableRetryDelays();
  });
  const response = await start(context, await simulate(context));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: "queued" });
}

const launchRow = (id: string) =>
  db
    .select()
    .from(launches)
    .where(eq(launches.id, id))
    .then(([row]) => row!);

const itemRows = (launchId: string) =>
  db
    .select()
    .from(launchItems)
    .where(eq(launchItems.launchId, launchId))
    .orderBy(launchItems.position);

const auditActions = (launchId: string) =>
  db
    .select({ action: auditLog.action, objectMetaId: auditLog.objectMetaId })
    .from(auditLog)
    .where(eq(auditLog.launchId, launchId));

describe("LaunchWorkflow", () => {
  it("creates 1 campaign, 1 adset and 7 ads in 2 batches", async () => {
    const context = await setup(7);
    const meta = fakeMeta();
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    expect(
      await instance.waitForStepResult({ name: "read counters 1" }),
    ).toMatchObject({ itemsDone: 5, itemsFailed: 0 });
    expect(
      await instance.waitForStepResult({ name: "read counters 2" }),
    ).toMatchObject({ itemsDone: 7, itemsFailed: 0 });
    expect(meta.campaigns).toHaveLength(1);
    expect(meta.adsets).toHaveLength(1);
    expect(meta.adsets[0]!.get("campaign_id")).toBe("campaigns-1");
    expect(meta.adcreatives).toHaveLength(7);
    expect(meta.ads).toHaveLength(7);
    expect(meta.ads.every((form) => form.get("adset_id") === "adsets-1")).toBe(
      true,
    );
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verifying",
      phase: "verify",
      attempt: 1,
      workflowInstanceId: `launch-${context.launch.id}-1`,
      metaCampaignId: "campaigns-1",
      metaAdsetId: "adsets-1",
      itemsTotal: 7,
      itemsDone: 7,
      itemsFailed: 0,
    });
    const items = await itemRows(context.launch.id);
    expect(items.map(({ status }) => status)).toEqual(Array(7).fill("done"));
    expect(items.every(({ metaAdId }) => metaAdId?.startsWith("ads-"))).toBe(
      true,
    );
    const actions = (await auditActions(context.launch.id)).map(
      ({ action }) => action,
    );
    expect(
      actions.filter((action) => action === "launch.campaign.create"),
    ).toHaveLength(1);
    expect(
      actions.filter((action) => action === "launch.adset.create"),
    ).toHaveLength(1);
    expect(
      actions.filter((action) => action === "launch.creative.create"),
    ).toHaveLength(7);
    expect(
      actions.filter((action) => action === "launch.ad.create"),
    ).toHaveLength(7);
  });

  it("does not duplicate the campaign when its step is retried", async () => {
    const context = await setup(1);
    const meta = fakeMeta({ campaigns: { failFirstPost: true } });
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    expect(meta.campaigns).toHaveLength(1);
    expect(meta.adsets[0]!.get("campaign_id")).toBe("campaigns-1");
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verifying",
      metaCampaignId: "campaigns-1",
      itemsDone: 1,
    });
  });

  it("fails one item with Meta's message and keeps going", async () => {
    const context = await setup(2);
    fakeMeta({ ads: { rejectName: "Anuncio 2" } });
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    const [first, second] = await itemRows(context.launch.id);
    expect(first).toMatchObject({ status: "done" });
    expect(second).toMatchObject({
      status: "failed",
      errorCode: "META_ERROR",
      errorMessage: "Texto rechazado: El texto no cumple las políticas",
    });
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verifying",
      itemsDone: 1,
      itemsFailed: 1,
    });
  });

  it("fails the launch when Meta rejects the campaign", async () => {
    const context = await setup(1);
    fakeMeta();
    server.use(
      metaFails(`${ACCOUNT_META_ID}/campaigns`, {
        error: { message: "Invalid parameter", code: 100 },
      }),
    );
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("errored");

    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "failed",
      errorCode: "META_ERROR",
      metaCampaignId: null,
    });
  });
});

describe("POST /api/w/:wid/launches/:id/start", () => {
  it("returns 409 NOT_SIMULATED for a draft", async () => {
    const context = await setup(1);

    await expectError(await start(context, "hash"), 409, "NOT_SIMULATED");
  });

  it("returns 409 PLAN_CHANGED when the plan hash is stale", async () => {
    const context = await setup(1);
    await simulate(context);

    await expectError(await start(context, "stale"), 409, "PLAN_CHANGED");
  });

  it("returns 409 PLAN_CHANGED when the draft changed after simulate", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);
    await db
      .update(launches)
      .set({
        draft: JSON.stringify({ ...context.draft, dailyBudgetMinor: 3000 }),
      })
      .where(eq(launches.id, context.launch.id));

    await expectError(await start(context, planHash), 409, "PLAN_CHANGED");
    expect((await launchRow(context.launch.id)).status).toBe("simulated");
  });

  it("returns 422 BLOCKERS when a blocker appeared after simulate", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);
    await db
      .update(creatives)
      .set({ status: "processing" })
      .where(eq(creatives.id, context.images[0]!.id));

    await expectError(await start(context, planHash), 422, "BLOCKERS");
  });

  it("returns 409 META_RECONNECT_REQUIRED when the token was revoked", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);
    server.use(metaFails(ACCOUNT_META_ID, sessionFixture, 401));

    await expectError(
      await start(context, planHash),
      409,
      "META_RECONNECT_REQUIRED",
    );
  });

  it("returns 400 without confirm", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);

    await expectError(
      await call(context, "start", { body: { planHash } }),
      400,
      "VALIDATION",
    );
  });
});
