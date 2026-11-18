/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type {
  AccountHealth,
  AdWithIssues,
  InsightRow,
} from "../api/integrations/meta/read";
import { aadFor, encryptToken } from "../api/lib/token-crypto";
import { utcPeriods } from "../api/lib/time";
import { DEFAULT_PILOT_RULES } from "../api/repositories/pilot-rules";
import { GLOBAL_SCOPE_ID } from "../api/repositories/usage-counters";
import { resolveWindow } from "../shared/insight-range";
import { measureAiUsage } from "../shared/ai-neuron-rates";
import { cpaMinor, cpmMinor, ctr, roas } from "../shared/metrics";
import {
  buildBetaInvite,
  buildCreative,
  buildLaunch,
  buildMembership,
  buildMetaAsset,
  buildMetaConnection,
  buildPilotProposal,
  buildPilotRule,
  buildPilotRun,
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
import { aiUsage, auditLog, usageCounters } from "./schema/ops";
import {
  insightsCache,
  pilotProposals,
  pilotRules,
  pilotRuns,
  protectedCampaigns,
} from "./schema/pilot";
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
const PREVIEW = process.argv.includes("--preview");
const DEV_VARS_FILE = PREVIEW ? ".dev.vars.preview" : ".dev.vars";
const WRANGLER_TARGET = PREVIEW
  ? ["DB", "--env", "preview", "--remote"]
  : [DATABASE_NAME, "--local"];
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

const MINUTE_MS = 60 * 1000;
const SEED_TTL_MS = 30 * 24 * HOUR_MS;
const FIXTURES_DIR = resolve(ROOT, "tests/fixtures/insights");
const INSIGHT_PRESETS = ["today", "yesterday", "last_7d"] as const;
const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PROPOSALS = [
  {
    slug: "scale",
    ruleType: "scale_winner",
    action: "scale",
    campaign: 1,
    evidence: { minRoas: 2.5 },
    currentBudgetMinor: 20000,
    proposedBudgetMinor: 26000,
    percent: 30,
    explanation: "ROAS alto sostenido: conviene subir el presupuesto un 30 %",
  },
  {
    slug: "no-sales",
    ruleType: "pause_no_sales",
    action: "pause",
    campaign: 2,
    evidence: { targetCpaMinor: 1500, spendThresholdMinor: 3000 },
    currentBudgetMinor: null,
    proposedBudgetMinor: null,
    percent: null,
    explanation: "Gastó más del doble del CPA objetivo sin ninguna venta",
  },
  {
    slug: "low-roas",
    ruleType: "pause_low_roas",
    action: "pause",
    campaign: 3,
    evidence: { roasMax: 1 },
    currentBudgetMinor: null,
    proposedBudgetMinor: null,
    percent: null,
    explanation: "El ROAS está por debajo del mínimo con gasto relevante",
  },
] as const;

const PILOT_ACCOUNT = 1;
const PROTECTED_CAMPAIGN = { account: 2, number: 1 };
const SCALED_CAMPAIGN = { account: 1, number: 1 };
const PILOT_PAUSED_AD = { id: "9100000000002", name: "Anuncio sin ventas" };

const AI_CALLS = [
  { feature: "tagging", inputTokens: 1200, outputTokens: 150 },
  { feature: "tagging", inputTokens: 900, outputTokens: 120 },
  { feature: "copy", inputTokens: 800, outputTokens: 300 },
  { feature: "pilot", inputTokens: 1500, outputTokens: 400 },
  { feature: "chat", inputTokens: 2000, outputTokens: 500 },
] as const;

const presetMetricsSchema = z.object({
  spendMinor: z.int(),
  impressions: z.int(),
  clicks: z.int(),
  purchases: z.int(),
  purchaseValueMinor: z.int(),
});

const campaignFixturesSchema = z.array(
  z.object({
    account: z.int(),
    number: z.int(),
    name: z.string(),
    metrics: z.record(z.enum(INSIGHT_PRESETS), presetMetricsSchema),
  }),
);

type DevVars = Record<string, string>;
type Tenant = (typeof TENANTS)[number];
type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];
type InsightPreset = (typeof INSIGHT_PRESETS)[number];
type PresetMetrics = z.infer<typeof presetMetricsSchema>;
type AuditFields = Omit<
  Insert<typeof auditLog>,
  | "id"
  | "workspaceId"
  | "actorUserId"
  | "actorType"
  | "result"
  | "requestId"
  | "createdAt"
  | "detail"
> & { detail: object };

interface SeedAccount {
  number: number;
  id: string;
  metaId: string;
  timezone: string;
}

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf8"));
}

const CAMPAIGN_FIXTURES = campaignFixturesSchema.parse(
  readFixture("seed-campaigns.json"),
);
const HEALTH_FIXTURE = readFixture("seed-health.json") as AccountHealth;
const ISSUES_FIXTURE = readFixture("seed-issues.json") as Record<
  string,
  AdWithIssues[]
>;

const accountMetaId = (prefix: number, account: number) =>
  `act_${prefix}000000000${account}`;

const campaignMetaId = (prefix: number, account: number, campaign: number) =>
  `${prefix}4${account}0000000000${campaign}`;

const findCampaign = (
  prefix: number,
  accounts: SeedAccount[],
  accountNumber: number,
  number: number,
) => {
  const fixture = CAMPAIGN_FIXTURES.find(
    (campaign) =>
      campaign.account === accountNumber && campaign.number === number,
  );
  if (!fixture) {
    throw new Error(`Campaign fixture ${accountNumber}/${number} missing`);
  }
  return {
    fixture,
    account: accounts[accountNumber - 1]!,
    metaId: campaignMetaId(prefix, accountNumber, number),
  };
};

function readDevVars(): DevVars {
  const path = resolve(ROOT, DEV_VARS_FILE);
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
  if (!key) throw new Error(`TOKEN_ENC_KEY_V1 missing in ${DEV_VARS_FILE}`);
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
  const accountIds = [1, 2].map((n) => accountMetaId(prefix, n));
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
      adAccountMetaId: accountMetaId(prefix, 1),
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

function toSeedAccounts(assets: Insert<typeof metaAssets>[]): SeedAccount[] {
  return assets
    .filter(({ kind }) => kind === "ad_account")
    .map(({ id, metaId, timezoneName }, i) => ({
      number: i + 1,
      id,
      metaId,
      timezone: timezoneName ?? "UTC",
    }));
}

function insightRow(
  level: InsightRow["level"],
  entity: { id: string; name: string | null; campaignId: string | null },
  date: string,
  metrics: PresetMetrics,
): InsightRow {
  return {
    level,
    ...entity,
    adsetId: null,
    date,
    ...metrics,
    roas: roas(metrics.purchaseValueMinor, metrics.spendMinor),
    cpaMinor: cpaMinor(metrics.spendMinor, metrics.purchases),
    ctr: ctr(metrics.clicks, metrics.impressions),
    cpmMinor: cpmMinor(metrics.spendMinor, metrics.impressions),
  };
}

const sumMetrics = (list: PresetMetrics[]): PresetMetrics =>
  list.reduce((total, metrics) => ({
    spendMinor: total.spendMinor + metrics.spendMinor,
    impressions: total.impressions + metrics.impressions,
    clicks: total.clicks + metrics.clicks,
    purchases: total.purchases + metrics.purchases,
    purchaseValueMinor: total.purchaseValueMinor + metrics.purchaseValueMinor,
  }));

function buildInsightsCache(
  tenant: Tenant,
  tenantIndex: number,
  workspaceId: string,
  accounts: SeedAccount[],
) {
  const prefix = tenantIndex + 1;
  const at = Date.now();
  return accounts.flatMap((account) => {
    const campaigns = CAMPAIGN_FIXTURES.filter(
      (campaign) => campaign.account === account.number,
    );
    const windowOf = (preset: InsightPreset) =>
      resolveWindow({ preset }, account.timezone, new Date(at));
    const entry = (
      level: Insert<typeof insightsCache>["level"],
      rangeKey: string,
      window: ReturnType<typeof windowOf>,
      rows: unknown[],
    ): Insert<typeof insightsCache> => ({
      id: `seed-insights-${level}-${rangeKey}-${account.number}-${tenant.key}`,
      workspaceId,
      adAccountAssetId: account.id,
      level,
      rangeKey,
      dateFrom: window.since,
      dateTo: window.until,
      payload: JSON.stringify(rows),
      rowCount: rows.length,
      fetchedAt: at,
      expiresAt: at + SEED_TTL_MS,
    });
    const presetEntries = INSIGHT_PRESETS.flatMap((preset) => {
      const window = windowOf(preset);
      const accountRow = insightRow(
        "account",
        { id: account.metaId, name: null, campaignId: null },
        window.since,
        sumMetrics(campaigns.map(({ metrics }) => metrics[preset])),
      );
      const campaignRows = campaigns.map(({ number, name, metrics }) => {
        const id = campaignMetaId(prefix, account.number, number);
        return insightRow(
          "campaign",
          { id, name, campaignId: id },
          window.since,
          metrics[preset],
        );
      });
      return [
        entry("account", preset, window, [accountRow]),
        entry("campaign", preset, window, campaignRows),
      ];
    });
    const today = windowOf("today");
    return [
      ...presetEntries,
      entry("health", "today", today, [HEALTH_FIXTURE]),
      entry("issues", "today", today, ISSUES_FIXTURE[account.number] ?? []),
    ];
  });
}

function buildPilot(
  tenant: Tenant,
  tenantIndex: number,
  workspaceId: string,
  createdBy: string,
  accounts: SeedAccount[],
) {
  const prefix = tenantIndex + 1;
  const at = Date.now();
  const run = buildPilotRun({
    id: `seed-pilot-run-${tenant.key}`,
    workspaceId,
    triggeredBy: createdBy,
    proposalsCreated: PROPOSALS.length,
    startedAt: at - HOUR_MS,
    finishedAt: at - HOUR_MS + MINUTE_MS,
  });
  const proposals = PROPOSALS.map((spec, i) => {
    const { fixture, account, metaId } = findCampaign(
      prefix,
      accounts,
      PILOT_ACCOUNT,
      spec.campaign,
    );
    const metrics = fixture.metrics.last_7d;
    return buildPilotProposal({
      id: `seed-pilot-proposal-${spec.slug}-${tenant.key}`,
      workspaceId,
      runId: run.id,
      ruleType: spec.ruleType,
      action: spec.action,
      adAccountMetaId: account.metaId,
      objectMetaId: metaId,
      objectName: fixture.name,
      evidence: JSON.stringify({
        range: "last_7d",
        spendMinor: metrics.spendMinor,
        purchases: metrics.purchases,
        purchaseValueMinor: metrics.purchaseValueMinor,
        roas: roas(metrics.purchaseValueMinor, metrics.spendMinor),
        cpaMinor: cpaMinor(metrics.spendMinor, metrics.purchases),
        ...spec.evidence,
      }),
      currentBudgetMinor: spec.currentBudgetMinor,
      proposedBudgetMinor: spec.proposedBudgetMinor,
      percent: spec.percent,
      explanation: spec.explanation,
      expiresAt: at + SEED_TTL_MS,
      createdAt: at - i * MINUTE_MS,
    });
  });
  const protectedTarget = findCampaign(
    prefix,
    accounts,
    PROTECTED_CAMPAIGN.account,
    PROTECTED_CAMPAIGN.number,
  );
  const protectedRows: Insert<typeof protectedCampaigns>[] = [
    {
      workspaceId,
      campaignMetaId: protectedTarget.metaId,
      adAccountMetaId: protectedTarget.account.metaId,
      protectedBy: createdBy,
      createdAt: at - 4 * HOUR_MS,
    },
  ];
  return { pilotRuns: [run], pilotProposals: proposals, protectedRows };
}

function buildAuditEntries(
  tenant: Tenant,
  tenantIndex: number,
  workspaceId: string,
  actorUserId: string,
  accounts: SeedAccount[],
) {
  const prefix = tenantIndex + 1;
  const at = Date.now();
  const campaignTarget = (campaign: { account: number; number: number }) => {
    const { fixture, account, metaId } = findCampaign(
      prefix,
      accounts,
      campaign.account,
      campaign.number,
    );
    return {
      objectType: "campaign",
      objectMetaId: metaId,
      objectName: fixture.name,
      adAccountMetaId: account.metaId,
    };
  };
  const entries: [string, AuditFields][] = [
    [
      "protect",
      {
        origin: "manual",
        action: "campaign.protect",
        ...campaignTarget(PROTECTED_CAMPAIGN),
        detail: { before: { protected: false }, after: { protected: true } },
      },
    ],
    [
      "scale",
      {
        origin: "manual",
        action: "meta.budget.scale",
        ...campaignTarget(SCALED_CAMPAIGN),
        detail: {
          percent: 20,
          before: { dailyBudgetMinor: 16700 },
          after: { dailyBudgetMinor: 20000 },
        },
      },
    ],
    [
      "pilot-pause",
      {
        origin: "pilot",
        action: "meta.status.update",
        objectType: "ad",
        objectMetaId: PILOT_PAUSED_AD.id,
        objectName: PILOT_PAUSED_AD.name,
        adAccountMetaId: accounts[PILOT_ACCOUNT - 1]!.metaId,
        detail: { before: { status: "ACTIVE" }, after: { status: "PAUSED" } },
      },
    ],
    [
      "rules",
      {
        origin: "manual",
        action: "pilot.rules.update",
        objectType: "pilot_rules",
        detail: { ruleType: "pause_no_sales", enabled: true },
      },
    ],
  ];
  return entries.map(
    ([slug, { detail, ...fields }], i): Insert<typeof auditLog> => ({
      id: `seed-audit-${slug}-${tenant.key}`,
      workspaceId,
      actorUserId,
      actorType: "user",
      result: "ok",
      requestId: `seed-request-${slug}-${tenant.key}`,
      createdAt: at - (i + 1) * HOUR_MS,
      detail: JSON.stringify(detail),
      ...fields,
    }),
  );
}

function buildAiUsage(
  tenant: Tenant,
  workspaceId: string,
  userId: string,
): Insert<typeof aiUsage>[] {
  const at = Date.now();
  return AI_CALLS.map(({ feature, inputTokens, outputTokens }, i) => ({
    id: `seed-ai-usage-${i + 1}-${tenant.key}`,
    workspaceId,
    userId,
    feature,
    provider: "workers_ai",
    ...measureAiUsage(AI_MODEL, inputTokens, outputTokens),
    status: "ok",
    createdAt: at - i * MINUTE_MS,
  }));
}

const totalNeurons = (rows: Insert<typeof aiUsage>[]) =>
  rows.reduce((total, { neurons }) => total + (neurons ?? 0), 0);

function buildNeuronCounters(
  scope: "workspace" | "global",
  scopeId: string,
  neurons: number,
): Insert<typeof usageCounters>[] {
  const at = Date.now();
  const { day, month } = utcPeriods(at);
  const periods = scope === "workspace" ? [day, month] : [day];
  return periods.map((period) => ({
    scope,
    scopeId,
    period,
    metric: "ai_neurons",
    value: neurons,
    updatedAt: at,
  }));
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
  const assets = buildAssets(tenant, tenantIndex, workspace.id, connectionId);
  const accounts = toSeedAccounts(assets);
  const aiUsageRows = buildAiUsage(tenant, workspace.id, owner.id);
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
    assets,
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
    insightsCache: buildInsightsCache(
      tenant,
      tenantIndex,
      workspace.id,
      accounts,
    ),
    ...buildPilot(tenant, tenantIndex, workspace.id, owner.id, accounts),
    auditEntries: buildAuditEntries(
      tenant,
      tenantIndex,
      workspace.id,
      owner.id,
      accounts,
    ),
    aiUsage: aiUsageRows,
    neuronCounters: buildNeuronCounters(
      "workspace",
      workspace.id,
      totalNeurons(aiUsageRows),
    ),
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
  const globalNeuronCounters = buildNeuronCounters(
    "global",
    GLOBAL_SCOPE_ID,
    totalNeurons(tenants.flatMap((t) => t.aiUsage)),
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
    renderInsertOrIgnore(
      insightsCache,
      tenants.flatMap((t) => t.insightsCache),
    ),
    renderInsertOrIgnore(
      pilotRuns,
      tenants.flatMap((t) => t.pilotRuns),
    ),
    renderInsertOrIgnore(
      pilotProposals,
      tenants.flatMap((t) => t.pilotProposals),
    ),
    renderInsertOrIgnore(
      protectedCampaigns,
      tenants.flatMap((t) => t.protectedRows),
    ),
    renderInsertOrIgnore(
      auditLog,
      tenants.flatMap((t) => t.auditEntries),
    ),
    renderInsertOrIgnore(
      aiUsage,
      tenants.flatMap((t) => t.aiUsage),
    ),
    renderInsertOrIgnore(usageCounters, [
      ...tenants.flatMap((t) => t.neuronCounters),
      ...globalNeuronCounters,
    ]),
  ].join("\n");
}

function applyToDatabase(sql: string) {
  mkdirSync(dirname(SEED_SQL_PATH), { recursive: true });
  writeFileSync(SEED_SQL_PATH, sql);
  execFileSync(
    process.execPath,
    [
      WRANGLER_BIN,
      "d1",
      "execute",
      ...WRANGLER_TARGET,
      "--file",
      SEED_SQL_PATH,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
}

const devVars = readDevVars();
assertNotProduction(devVars);
applyToDatabase(await buildSeedSql(devVars));
