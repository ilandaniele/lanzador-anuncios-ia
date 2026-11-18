import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { createApp } from "../../../src/api/app";
import type { creatives } from "../../../src/db/schema/creatives";
import { launchItems, launches } from "../../../src/db/schema/launches";
import { auditLog } from "../../../src/db/schema/ops";
import { launchPlanSchema } from "../../../src/shared/schemas/launch";
import {
  api,
  createCreative,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createProduct,
} from "../../helpers/factory";
import { graphUrl, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import { seedWorkspaceWithRoles } from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";
import { fakeVerify, type VerifyPatch } from "./verify-fake";

const app = createApp();
export const db = drizzle(env.DB);
const TOKEN = "EAABlaunchWorkflowToken123";
export const ACCOUNT_META_ID = "act_555";
const DRAFT_AT = Date.UTC(2026, 2, 5, 15, 30);
const routeEnv = {
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_EXP: openLimiter,
};

type Caller = NonNullable<Parameters<typeof api>[2]>;
type CreativeOverrides = Partial<typeof creatives.$inferInsert>;
export type LaunchSetup = Awaited<ReturnType<typeof setup>>;

const metaTime = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+0000");

const filteredName = (request: { url: string }) => {
  const filtering = new URL(request.url).searchParams.get("filtering");
  const [rule] = JSON.parse(filtering ?? "[]") as { value?: string }[];
  return rule?.value;
};

export interface EdgeOptions {
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

export function fakeMeta(
  options: Partial<Record<string, EdgeOptions>> = {},
  patch?: VerifyPatch,
) {
  const edges = {
    campaigns: fakeEdge("campaigns", options.campaigns),
    adsets: fakeEdge("adsets", options.adsets),
    adcreatives: fakeEdge("adcreatives", options.adcreatives),
    ads: fakeEdge("ads", options.ads),
  };
  server.use(...fakeVerify(edges, patch));
  return edges;
}

const healthyAccount = () =>
  metaReplies(ACCOUNT_META_ID, {
    id: ACCOUNT_META_ID,
    account_status: 1,
    currency: "USD",
  });

export async function setup(itemCount = 7, creative: CreativeOverrides = {}) {
  const { workspace, users } = await seedWorkspaceWithRoles();
  const connection = await createMetaConnection(env, workspace.id, TOKEN);
  const account = await createMetaAsset(workspace.id, connection.id, {
    metaId: ACCOUNT_META_ID,
  });
  const product = await createProduct(workspace.id, { name: "Gorra" });
  const images = await Promise.all(
    Array.from({ length: itemCount }, () =>
      createCreative(workspace.id, account.id, creative),
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
      mediaKind: creative.kind ?? "image",
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
    viewer: users.viewer,
    launch,
    images,
    draft,
    connection,
    account,
  };
}

export const call = (
  context: LaunchSetup,
  action: string,
  options: Caller = {},
) =>
  api(app, `/api/w/${context.wid}/launches/${context.launch.id}/${action}`, {
    env: routeEnv,
    method: "POST",
    as: context.editor,
    ...options,
  });

export async function simulate(context: LaunchSetup) {
  const response = await call(context, "simulate");
  expect(response.status).toBe(200);
  return launchPlanSchema.parse(await response.json()).planHash;
}

export const start = (context: LaunchSetup, planHash: string) =>
  call(context, "start", { body: { confirm: true, planHash } });

export const introspect = (context: LaunchSetup) =>
  introspectWorkflowInstance(env.LAUNCH_WF, `launch-${context.launch.id}-1`);

export async function startLaunch(
  context: LaunchSetup,
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

export const launchRow = (id: string) =>
  db
    .select()
    .from(launches)
    .where(eq(launches.id, id))
    .then(([row]) => row!);

export const itemRows = (launchId: string) =>
  db
    .select()
    .from(launchItems)
    .where(eq(launchItems.launchId, launchId))
    .orderBy(launchItems.position);

export const auditActions = (launchId: string) =>
  db
    .select({ action: auditLog.action, objectMetaId: auditLog.objectMetaId })
    .from(auditLog)
    .where(eq(auditLog.launchId, launchId));
