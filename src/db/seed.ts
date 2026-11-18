/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { aadFor, encryptToken } from "../api/lib/token-crypto";
import { DEFAULT_PILOT_RULES } from "../api/repositories/pilot-rules";
import {
  buildBetaInvite,
  buildCreative,
  buildLaunch,
  buildMembership,
  buildMetaAsset,
  buildMetaConnection,
  buildPilotRule,
  buildProduct,
  buildUser,
  buildWorkspace,
  buildWorkspaceSettings,
} from "./fixtures/builders";
import { renderInsertOrIgnore } from "./fixtures/render-sql";
import { betaInvites, users } from "./schema/auth";
import { creatives } from "./schema/creatives";
import { launchItems, launches } from "./schema/launches";
import { metaAssets, metaConnections } from "./schema/meta";
import { pilotRules } from "./schema/pilot";
import { products } from "./schema/products";
import {
  memberships,
  workspaceSettings,
  workspaces,
} from "./schema/workspaces";

const ROOT = resolve(import.meta.dirname, "../..");
const SEED_SQL_PATH = resolve(ROOT, ".wrangler/seed.sql");
const WRANGLER_BIN = resolve(ROOT, "node_modules/wrangler/bin/wrangler.js");
const DATABASE_NAME = "lanzador-db";
const TOKEN_KEY_VERSION = 1;
const SEED_ROLES = ["owner", "admin", "editor", "viewer"] as const;

const TENANTS = [
  { key: "a", name: "Marca Demo", businessName: "Marca Demo SA" },
  { key: "b", name: "Agencia Demo", businessName: "Agencia Demo SRL" },
] as const;

const PRODUCTS = [
  { name: "Zapatillas Runner", priceMinor: 8900, costMinor: 3200 },
  { name: "Remera Basica", priceMinor: 2500, costMinor: 900 },
  { name: "Mochila Urbana", priceMinor: 4500, costMinor: 1700 },
];

const HOUR_MS = 60 * 60 * 1000;

const CREATIVES = [
  {
    kind: "image",
    hook: "Antes y despues en 3 segundos",
    angle: "transformacion",
    format: "estatico",
  },
  {
    kind: "image",
    hook: "Oferta de temporada",
    angle: "descuento",
    format: "estatico",
  },
  {
    kind: "image",
    hook: "El favorito de los clientes",
    angle: "prueba social",
    format: "testimonio",
  },
  {
    kind: "video",
    hook: "Lo probe una semana entera",
    angle: "resena honesta",
    format: "ugc",
  },
  {
    kind: "video",
    hook: "Asi se usa paso a paso",
    angle: "demostracion",
    format: "demo",
  },
  {
    kind: "video",
    hook: "Mira lo que dicen de nosotros",
    angle: "prueba social",
    format: "testimonio",
  },
] as const;

const MEDIA_BY_KIND = {
  image: {
    contentType: "image/jpeg",
    extension: "jpg",
    sizeBytes: 10276,
    durationMs: null,
  },
  video: {
    contentType: "video/mp4",
    extension: "mp4",
    sizeBytes: 11535,
    durationMs: 1000,
  },
} as const;

const LAUNCHES = [
  {
    slug: "ok",
    status: "paused_verified",
    kind: "image",
    failedPosition: null,
  },
  {
    slug: "errors",
    status: "verified_with_errors",
    kind: "video",
    failedPosition: 2,
  },
] as const;

type DevVars = Record<string, string>;
type Tenant = (typeof TENANTS)[number];
type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

function readDevVars(): DevVars {
  const path = resolve(ROOT, ".dev.vars");
  if (!existsSync(path)) return {};
  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_]+)=(.*)$/))
    .filter((match) => match !== null)
    .map(([, key, value]) => [key, value] as const);
  return Object.fromEntries(entries);
}

function assertNotProduction(devVars: DevVars) {
  const environment =
    process.env.ENVIRONMENT ?? devVars.ENVIRONMENT ?? "development";
  if (environment === "production") {
    throw new Error("Refusing to seed: ENVIRONMENT is production");
  }
}

async function sealFakeToken(
  devVars: DevVars,
  token: string,
  connectionId: string,
  workspaceId: string,
) {
  const key = devVars.TOKEN_ENC_KEY_V1;
  if (!key) throw new Error("TOKEN_ENC_KEY_V1 missing in .dev.vars");
  const keyEnv = {
    TOKEN_ENC_KEY_CURRENT: TOKEN_KEY_VERSION,
    TOKEN_ENC_KEY_V1: key,
  };
  const sealed = await encryptToken(
    keyEnv,
    token,
    aadFor("meta_connections", connectionId, workspaceId),
  );
  return {
    tokenCiphertext: Buffer.from(sealed.ciphertext),
    tokenIv: Buffer.from(sealed.iv),
    tokenKeyVersion: sealed.keyVersion,
  };
}

function buildAssets(
  tenant: Tenant,
  tenantIndex: number,
  workspaceId: string,
  connectionId: string,
) {
  const prefix = tenantIndex + 1;
  const asset = (slug: string, overrides: Partial<Insert<typeof metaAssets>>) =>
    buildMetaAsset({
      id: `seed-asset-${slug}-${tenant.key}`,
      workspaceId,
      connectionId,
      enabled: 1,
      ...overrides,
    });
  const notAccount = {
    currency: null,
    timezoneName: null,
    accountStatus: null,
  };
  const accountIds = [1, 2].map((n) => `act_${prefix}000000000${n}`);
  const pageId = `${prefix}10000000000001`;
  return [
    ...accountIds.map((metaId, i) =>
      asset(`account-${i + 1}`, { metaId, name: `Cuenta ${i + 1}` }),
    ),
    asset("page", {
      kind: "page",
      metaId: pageId,
      name: tenant.name,
      ...notAccount,
    }),
    asset("instagram", {
      kind: "instagram",
      metaId: `${prefix}20000000000001`,
      name: `${tenant.key}_demo`,
      parentMetaId: pageId,
      ...notAccount,
    }),
    ...accountIds.map((parentMetaId, i) =>
      asset(`pixel-${i + 1}`, {
        kind: "pixel",
        metaId: `${prefix}3000000000000${i + 1}`,
        name: `Pixel ${i + 1}`,
        parentMetaId,
        ...notAccount,
      }),
    ),
  ];
}

function buildCreatives(
  tenant: Tenant,
  tenantIndex: number,
  workspaceId: string,
  createdBy: string,
) {
  const at = Date.now();
  return CREATIVES.map(({ kind, hook, angle, format }, i) => {
    const n = i + 1;
    const media = MEDIA_BY_KIND[kind];
    return buildCreative({
      id: `seed-creative-${n}-${tenant.key}`,
      workspaceId,
      adAccountAssetId: `seed-asset-account-1-${tenant.key}`,
      kind,
      originalFilename: `seed-${kind}-${n}.${media.extension}`,
      contentType: media.contentType,
      sizeBytes: media.sizeBytes,
      durationMs: media.durationMs,
      width: 320,
      height: 568,
      metaVideoId:
        kind === "video" ? `${tenantIndex + 1}9000000000000${n}` : null,
      metaImageHash: kind === "image" ? `seedhash${tenant.key}${n}` : null,
      thumbnailUrl: `https://thumbnails.lanzador.test/seed/${tenant.key}/creative-${n}.jpg`,
      thumbnailRefreshedAt: at,
      aiStatus: "done",
      tagHook: hook,
      tagAngle: angle,
      tagFormat: format,
      tagLanguage: "es",
      tagOnScreenText: kind === "image" ? 1 : 0,
      tagSummary: `${hook}. Creativo de prueba ${n}.`,
      aiModel: "seed",
      adName: `Creativo ${n}`,
      createdBy,
      createdAt: at - (CREATIVES.length - i) * HOUR_MS,
    });
  });
}

function buildLaunches(
  tenant: Tenant,
  tenantIndex: number,
  workspaceId: string,
  createdBy: string,
  creativeRows: ReturnType<typeof buildCreatives>,
) {
  const prefix = tenantIndex + 1;
  const at = Date.now();
  const rows = LAUNCHES.map((spec, l) => {
    const launchId = `seed-launch-${spec.slug}-${tenant.key}`;
    const launchCreatives = creativeRows.filter(
      ({ kind }) => kind === spec.kind,
    );
    const createdAt = at - (LAUNCHES.length - l) * HOUR_MS;
    const items = launchCreatives.map(
      (creative, position): Insert<typeof launchItems> => {
        const failed = position === spec.failedPosition;
        return {
          id: `seed-launch-item-${spec.slug}-${position + 1}-${tenant.key}`,
          workspaceId,
          launchId,
          position,
          source: "upload",
          creativeId: creative.id,
          adName: `${creative.adName} ${l + 1}`,
          status: failed ? "failed" : "done",
          attempt: 1,
          metaVideoId: creative.metaVideoId,
          metaImageHash: creative.metaImageHash,
          ...(failed
            ? {
                errorCode: "CREATIVE_NOT_READY",
                errorMessage: "El creativo no terminó",
              }
            : {
                metaCreativeId: `${prefix}8${l}000000000${position + 1}`,
                metaAdId: `${prefix}7${l}000000000${position + 1}`,
              }),
          createdAt,
          updatedAt: createdAt,
        };
      },
    );
    const itemsFailed = items.filter(
      ({ status }) => status === "failed",
    ).length;
    const draft = {
      adAccountAssetId: `seed-asset-account-1-${tenant.key}`,
      pixelId: `${prefix}30000000000001`,
      pageId: `${prefix}10000000000001`,
      instagramUserId: `${prefix}20000000000001`,
      mode: "new_cbo",
      productId: `seed-product-1-${tenant.key}`,
      copy: {
        primaryText: "Texto principal de prueba",
        headline: "Titular de prueba",
        description: "Descripcion de prueba",
        cta: "SHOP_NOW",
      },
      items: items.map(({ creativeId, adName }) => ({
        source: "upload",
        creativeId: creativeId ?? undefined,
        adName,
        mediaKind: spec.kind,
      })),
      dailyBudgetMinor: 5000,
      bidStrategy: "LOWEST_COST_WITHOUT_CAP",
      countries: ["AR"],
      optimizationEvent: "PURCHASE",
      campaignName: `Campaña seed ${spec.slug}`,
      adsetName: `Conjunto seed ${spec.slug}`,
    };
    const launch = buildLaunch({
      id: launchId,
      workspaceId,
      status: spec.status,
      phase: "verify",
      mode: "new_cbo",
      adAccountAssetId: draft.adAccountAssetId,
      adAccountMetaId: `act_${prefix}000000001`,
      currency: "USD",
      productId: draft.productId,
      draft: JSON.stringify(draft),
      dailyBudgetMinor: draft.dailyBudgetMinor,
      metaCampaignId: `${prefix}6${l}00000000001`,
      metaAdsetId: `${prefix}5${l}00000000001`,
      itemsTotal: items.length,
      itemsDone: items.length - itemsFailed,
      itemsFailed,
      checks: JSON.stringify([
        { ok: true, code: "CAMPAIGN_PAUSED", text: "Campaña en pausa" },
        {
          ok: itemsFailed === 0,
          code: "ALL_ADS_CREATED",
          text: "Todos los anuncios creados",
        },
      ]),
      checksOk: itemsFailed === 0 ? 1 : 0,
      attempt: 1,
      createdBy,
      startedBy: createdBy,
      createdAt,
      startedAt: createdAt + 1000,
      finishedAt: createdAt + 60 * 1000,
      updatedAt: createdAt + 60 * 1000,
    });
    return { launch, items };
  });
  return {
    launches: rows.map(({ launch }) => launch),
    launchItems: rows.flatMap(({ items }) => items),
  };
}

async function buildTenantRows(
  tenant: Tenant,
  tenantIndex: number,
  devVars: DevVars,
) {
  const roleUsers = SEED_ROLES.map((role) =>
    buildUser({
      id: `seed-user-${role}-${tenant.key}`,
      email: `${role}-${tenant.key}@lanzador.test`,
      name: `${role} ${tenant.key.toUpperCase()}`,
    }),
  );
  const owner = roleUsers[0]!;
  const workspace = buildWorkspace({
    id: `seed-workspace-${tenant.key}`,
    name: tenant.name,
    ownerUserId: owner.id,
  });
  const connectionId = `seed-connection-${tenant.key}`;
  const creativeRows = buildCreatives(
    tenant,
    tenantIndex,
    workspace.id,
    owner.id,
  );
  return {
    users: roleUsers,
    workspaces: [workspace],
    memberships: roleUsers.map((user, i) =>
      buildMembership({
        id: `seed-membership-${SEED_ROLES[i]}-${tenant.key}`,
        workspaceId: workspace.id,
        userId: user.id,
        role: SEED_ROLES[i]!,
      }),
    ),
    settings: [
      buildWorkspaceSettings({
        workspaceId: workspace.id,
        updatedBy: owner.id,
      }),
    ],
    pilotRules: DEFAULT_PILOT_RULES.map(({ ruleType, enabled, params }) =>
      buildPilotRule({
        id: `seed-pilot-rule-${ruleType}-${tenant.key}`,
        workspaceId: workspace.id,
        ruleType,
        enabled,
        params: JSON.stringify(params),
        updatedBy: owner.id,
      }),
    ),
    connections: [
      buildMetaConnection({
        id: connectionId,
        workspaceId: workspace.id,
        metaBusinessId: `${tenantIndex + 1}00000000000001`,
        businessName: tenant.businessName,
        connectedBy: owner.id,
        ...(await sealFakeToken(
          devVars,
          `seed-fake-meta-token-${tenant.key}`,
          connectionId,
          workspace.id,
        )),
      }),
    ],
    assets: buildAssets(tenant, tenantIndex, workspace.id, connectionId),
    products: PRODUCTS.map((product, i) =>
      buildProduct({
        id: `seed-product-${i + 1}-${tenant.key}`,
        workspaceId: workspace.id,
        createdBy: owner.id,
        ...product,
      }),
    ),
    creatives: creativeRows,
    ...buildLaunches(tenant, tenantIndex, workspace.id, owner.id, creativeRows),
  };
}

async function buildSeedSql(devVars: DevVars) {
  const superadmin = buildUser({
    id: "seed-user-superadmin",
    email: "admin@lanzador.test",
    name: "Superadmin",
    isSuperadmin: 1,
  });
  const betaInvite = buildBetaInvite({
    id: "seed-beta-invite",
    email: "nuevo@lanzador.test",
    note: "Seed beta invite",
    invitedBy: superadmin.id,
  });
  const tenants = await Promise.all(
    TENANTS.map((tenant, i) => buildTenantRows(tenant, i, devVars)),
  );
  return [
    renderInsertOrIgnore(users, [
      superadmin,
      ...tenants.flatMap((t) => t.users),
    ]),
    renderInsertOrIgnore(betaInvites, [betaInvite]),
    renderInsertOrIgnore(
      workspaces,
      tenants.flatMap((t) => t.workspaces),
    ),
    renderInsertOrIgnore(
      memberships,
      tenants.flatMap((t) => t.memberships),
    ),
    renderInsertOrIgnore(
      workspaceSettings,
      tenants.flatMap((t) => t.settings),
    ),
    renderInsertOrIgnore(
      pilotRules,
      tenants.flatMap((t) => t.pilotRules),
    ),
    renderInsertOrIgnore(
      metaConnections,
      tenants.flatMap((t) => t.connections),
    ),
    renderInsertOrIgnore(
      metaAssets,
      tenants.flatMap((t) => t.assets),
    ),
    renderInsertOrIgnore(
      products,
      tenants.flatMap((t) => t.products),
    ),
    renderInsertOrIgnore(
      creatives,
      tenants.flatMap((t) => t.creatives),
    ),
    renderInsertOrIgnore(
      launches,
      tenants.flatMap((t) => t.launches),
    ),
    renderInsertOrIgnore(
      launchItems,
      tenants.flatMap((t) => t.launchItems),
    ),
  ].join("\n");
}

function applyToLocalDatabase(sql: string) {
  mkdirSync(dirname(SEED_SQL_PATH), { recursive: true });
  writeFileSync(SEED_SQL_PATH, sql);
  execFileSync(
    process.execPath,
    [
      WRANGLER_BIN,
      "d1",
      "execute",
      DATABASE_NAME,
      "--local",
      "--file",
      SEED_SQL_PATH,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
}

const devVars = readDevVars();
assertNotProduction(devVars);
applyToLocalDatabase(await buildSeedSql(devVars));
