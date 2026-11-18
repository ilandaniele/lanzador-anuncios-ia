import { betaInvites, users } from "../schema/auth";
import { creatives, uploads } from "../schema/creatives";
import { launches } from "../schema/launches";
import { metaAssets, metaConnections } from "../schema/meta";
import { chatMessages, chatSessions } from "../schema/ops";
import { pilotRules } from "../schema/pilot";
import { productCopies, products } from "../schema/products";
import {
  invitations,
  memberships,
  workspaceSettings,
  workspaces,
} from "../schema/workspaces";

export const buildUser = (
  overrides: Partial<typeof users.$inferInsert> = {},
): typeof users.$inferInsert => {
  const id = crypto.randomUUID();
  return {
    id,
    email: `${id}@example.test`,
    createdAt: Date.now(),
    ...overrides,
  };
};

export const buildWorkspace = (
  overrides: Pick<typeof workspaces.$inferInsert, "ownerUserId"> &
    Partial<typeof workspaces.$inferInsert>,
): typeof workspaces.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "Marca Demo",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildMembership = (
  overrides: Pick<
    typeof memberships.$inferInsert,
    "workspaceId" | "userId" | "role"
  > &
    Partial<typeof memberships.$inferInsert>,
): typeof memberships.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const buildInvitation = (
  overrides: Pick<
    typeof invitations.$inferInsert,
    "workspaceId" | "tokenHash"
  > &
    Partial<typeof invitations.$inferInsert>,
): typeof invitations.$inferInsert => {
  const id = crypto.randomUUID();
  const at = Date.now();
  return {
    id,
    email: `${id}@example.test`,
    role: "editor",
    createdAt: at,
    expiresAt: at + INVITATION_TTL_MS,
    ...overrides,
  };
};

export const buildProduct = (
  overrides: Pick<typeof products.$inferInsert, "workspaceId"> &
    Partial<typeof products.$inferInsert>,
): typeof products.$inferInsert => {
  const id = crypto.randomUUID();
  const at = Date.now();
  const name = overrides.name ?? `Producto ${id}`;
  return {
    id,
    name,
    nameNormalized: name.trim().toLowerCase(),
    landingUrl: "https://tienda.example.test/producto",
    primaryText: "Texto principal",
    headline: "Titular",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildProductCopy = (
  overrides: Pick<
    typeof productCopies.$inferInsert,
    "workspaceId" | "productId"
  > &
    Partial<typeof productCopies.$inferInsert>,
): typeof productCopies.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    angle: "manual",
    primaryText: "Texto principal",
    headline: "Titular",
    source: "manual",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildMetaConnection = (
  overrides: Pick<
    typeof metaConnections.$inferInsert,
    "workspaceId" | "tokenCiphertext" | "tokenIv" | "tokenKeyVersion"
  > &
    Partial<typeof metaConnections.$inferInsert>,
): typeof metaConnections.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    metaBusinessId: crypto.randomUUID(),
    businessName: "Negocio Demo",
    metaUserId: "100000000000001",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildMetaAsset = (
  overrides: Pick<
    typeof metaAssets.$inferInsert,
    "workspaceId" | "connectionId"
  > &
    Partial<typeof metaAssets.$inferInsert>,
): typeof metaAssets.$inferInsert => {
  const at = Date.now();
  const metaId = `act_${Math.floor(Math.random() * 1e15)}`;
  return {
    id: crypto.randomUUID(),
    kind: "ad_account",
    metaId,
    name: "Cuenta Demo",
    currency: "USD",
    timezoneName: "America/Argentina/Buenos_Aires",
    accountStatus: 1,
    enabled: 1,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildLaunch = (
  overrides: Pick<typeof launches.$inferInsert, "workspaceId"> &
    Partial<typeof launches.$inferInsert>,
): typeof launches.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildBetaInvite = (
  overrides: Partial<typeof betaInvites.$inferInsert> = {},
): typeof betaInvites.$inferInsert => {
  const id = crypto.randomUUID();
  return {
    id,
    email: `${id}@example.test`,
    createdAt: Date.now(),
    ...overrides,
  };
};

export const buildWorkspaceSettings = (
  overrides: Pick<typeof workspaceSettings.$inferInsert, "workspaceId"> &
    Partial<typeof workspaceSettings.$inferInsert>,
): typeof workspaceSettings.$inferInsert => ({
  updatedAt: Date.now(),
  ...overrides,
});

export const buildPilotRule = (
  overrides: Pick<
    typeof pilotRules.$inferInsert,
    "workspaceId" | "ruleType" | "params"
  > &
    Partial<typeof pilotRules.$inferInsert>,
): typeof pilotRules.$inferInsert => ({
  id: crypto.randomUUID(),
  enabled: 0,
  updatedAt: Date.now(),
  ...overrides,
});

export const buildChatSession = (
  overrides: Pick<typeof chatSessions.$inferInsert, "workspaceId" | "userId"> &
    Partial<typeof chatSessions.$inferInsert>,
): typeof chatSessions.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildChatMessage = (
  overrides: Pick<
    typeof chatMessages.$inferInsert,
    "workspaceId" | "sessionId" | "role"
  > &
    Partial<typeof chatMessages.$inferInsert>,
): typeof chatMessages.$inferInsert => ({
  id: crypto.randomUUID(),
  content: "hola",
  createdAt: Date.now(),
  ...overrides,
});

export const buildCreative = (
  overrides: Pick<
    typeof creatives.$inferInsert,
    "workspaceId" | "adAccountAssetId"
  > &
    Partial<typeof creatives.$inferInsert>,
): typeof creatives.$inferInsert => {
  const id = crypto.randomUUID();
  const at = Date.now();
  return {
    id,
    kind: "image",
    originalFilename: `creativo-${id}.png`,
    contentType: "image/png",
    sizeBytes: 1024,
    metaImageHash: `hash_${id}`,
    source: "browser",
    status: "ready",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export const buildUpload = (
  overrides: Pick<
    typeof uploads.$inferInsert,
    "workspaceId" | "adAccountAssetId"
  > &
    Partial<typeof uploads.$inferInsert>,
): typeof uploads.$inferInsert => {
  const at = Date.now();
  const sizeBytes = overrides.sizeBytes ?? 1024;
  return {
    id: crypto.randomUUID(),
    kind: "image",
    sizeBytes,
    sha256: "0".repeat(64),
    endOffset: sizeBytes,
    expiresAt: at + UPLOAD_TTL_MS,
    createdAt: at,
    ...overrides,
  };
};
