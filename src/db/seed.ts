/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { aadFor, encryptToken } from "../api/lib/token-crypto";
import { DEFAULT_PILOT_RULES } from "../api/repositories/pilot-rules";
import {
  buildBetaInvite,
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
