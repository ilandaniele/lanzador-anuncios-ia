import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import type { Env } from "../../src/api/env";
import type { Role, WorkspaceStatus } from "../../src/shared/constants";
import type { createApp } from "../../src/api/app";
import { randomToken, sha256Hex } from "../../src/api/lib/hash";
import { aadFor, encryptToken } from "../../src/api/lib/token-crypto";
import {
  createSession,
  SESSION_COOKIE,
} from "../../src/api/services/auth/session";
import { users } from "../../src/db/schema/auth";
import { creatives, uploads } from "../../src/db/schema/creatives";
import { buildCreative, buildUpload } from "../../src/db/fixtures/builders";
import { launches } from "../../src/db/schema/launches";
import { metaAssets, metaConnections } from "../../src/db/schema/meta";
import { chatMessages, chatSessions } from "../../src/db/schema/ops";
import { pilotProposals, pilotRuns } from "../../src/db/schema/pilot";
import { productCopies, products } from "../../src/db/schema/products";
import {
  invitations,
  memberships,
  workspaceSettings,
  workspaces,
} from "../../src/db/schema/workspaces";
import {
  buildChatMessage,
  buildChatSession,
  buildInvitation,
  buildLaunch,
  buildMembership,
  buildMetaAsset,
  buildMetaConnection,
  buildPilotProposal,
  buildPilotRun,
  buildProduct,
  buildProductCopy,
  buildUser,
  buildWorkspace,
} from "../../src/db/fixtures/builders";
import {
  readEnvelope,
  testEnv,
  trustedHeaders,
} from "../integration/pipeline/helpers";

type User = typeof users.$inferInsert;
type Member = { user: User; role: Exclude<Role, "owner"> };

export async function createUser(overrides: Partial<User> = {}) {
  const user = buildUser(overrides);
  await drizzle(env.DB).insert(users).values(user);
  return user;
}

export async function createWorkspace({
  owner,
  members = [],
  status,
}: {
  owner?: User;
  members?: Member[];
  status?: WorkspaceStatus;
} = {}) {
  const ownerUser = owner ?? (await createUser());
  const workspace = buildWorkspace({ ownerUserId: ownerUser.id, status });
  const rows = [{ user: ownerUser, role: "owner" as const }, ...members].map(
    ({ user, role }) =>
      buildMembership({ workspaceId: workspace.id, userId: user.id, role }),
  );
  const db = drizzle(env.DB);
  await db.batch([
    db.insert(workspaces).values(workspace),
    db.insert(memberships).values(rows),
    db
      .insert(workspaceSettings)
      .values({ workspaceId: workspace.id, updatedAt: workspace.updatedAt }),
  ]);
  return { workspace, owner: ownerUser };
}

export async function createInvitation(
  workspaceId: string,
  overrides: Partial<typeof invitations.$inferInsert> = {},
) {
  const token = randomToken(32);
  const invitation = buildInvitation({
    workspaceId,
    tokenHash: await sha256Hex(token),
    ...overrides,
  });
  await drizzle(env.DB).insert(invitations).values(invitation);
  return { invitation, token };
}

export async function createProduct(
  workspaceId: string,
  overrides: Partial<typeof products.$inferInsert> = {},
) {
  const product = buildProduct({ workspaceId, ...overrides });
  await drizzle(env.DB).insert(products).values(product);
  return product;
}

export async function createProductCopy(
  workspaceId: string,
  productId: string,
  overrides: Partial<typeof productCopies.$inferInsert> = {},
) {
  const copy = buildProductCopy({ workspaceId, productId, ...overrides });
  await drizzle(env.DB).insert(productCopies).values(copy);
  return copy;
}

export async function createLaunch(
  workspaceId: string,
  overrides: Partial<typeof launches.$inferInsert> = {},
) {
  const launch = buildLaunch({ workspaceId, ...overrides });
  await drizzle(env.DB).insert(launches).values(launch);
  return launch;
}

export async function createChatSession(
  workspaceId: string,
  userId: string,
  overrides: Partial<typeof chatSessions.$inferInsert> = {},
) {
  const session = buildChatSession({ workspaceId, userId, ...overrides });
  await drizzle(env.DB).insert(chatSessions).values(session);
  return session;
}

export async function createChatMessage(
  workspaceId: string,
  sessionId: string,
  role: (typeof chatMessages.$inferInsert)["role"],
  overrides: Partial<typeof chatMessages.$inferInsert> = {},
) {
  const message = buildChatMessage({
    workspaceId,
    sessionId,
    role,
    ...overrides,
  });
  await drizzle(env.DB).insert(chatMessages).values(message);
  return message;
}

export async function createPilotProposal(
  workspaceId: string,
  adAccountMetaId: string,
  overrides: Partial<typeof pilotProposals.$inferInsert> = {},
) {
  const run = buildPilotRun({ workspaceId });
  const proposal = buildPilotProposal({
    workspaceId,
    runId: run.id,
    adAccountMetaId,
    ...overrides,
  });
  const orm = drizzle(env.DB);
  await orm.batch([
    orm.insert(pilotRuns).values(run),
    orm.insert(pilotProposals).values(proposal),
  ]);
  return proposal;
}

export async function createMetaConnection(
  keyEnv: Pick<Env, "TOKEN_ENC_KEY_CURRENT">,
  workspaceId: string,
  token: string,
  overrides: Partial<typeof metaConnections.$inferInsert> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  const sealed = await encryptToken(
    keyEnv,
    token,
    aadFor("meta_connections", id, workspaceId),
  );
  const connection = buildMetaConnection({
    workspaceId,
    tokenCiphertext: Buffer.from(sealed.ciphertext),
    tokenIv: Buffer.from(sealed.iv),
    tokenKeyVersion: sealed.keyVersion,
    ...overrides,
    id,
  });
  await drizzle(env.DB).insert(metaConnections).values(connection);
  return connection;
}

export async function createMetaAsset(
  workspaceId: string,
  connectionId: string,
  overrides: Partial<typeof metaAssets.$inferInsert> = {},
) {
  const asset = buildMetaAsset({ workspaceId, connectionId, ...overrides });
  await drizzle(env.DB).insert(metaAssets).values(asset);
  return asset;
}

export async function loginAs(user: User) {
  const { token } = await createSession(env.DB, user.id, {});
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

export async function api(
  app: ReturnType<typeof createApp>,
  path: string,
  {
    as,
    method = "GET",
    body,
    env: envOverrides,
  }: {
    as?: User;
    method?: string;
    body?: unknown;
    env?: Partial<Env>;
  } = {},
) {
  const { cookie } = as ? await loginAs(as) : {};
  return app.request(
    path,
    {
      method,
      headers: {
        ...trustedHeaders,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    testEnv(envOverrides),
  );
}

export async function expectError(
  response: Response,
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect((await readEnvelope(response)).code).toBe(code);
}

export async function createCreative(
  workspaceId: string,
  adAccountAssetId: string,
  overrides: Partial<typeof creatives.$inferInsert> = {},
) {
  const creative = buildCreative({
    workspaceId,
    adAccountAssetId,
    ...overrides,
  });
  await drizzle(env.DB).insert(creatives).values(creative);
  return creative;
}

export async function createUpload(
  workspaceId: string,
  adAccountAssetId: string,
  overrides: Partial<typeof uploads.$inferInsert> = {},
) {
  const kind = overrides.kind ?? "image";
  const creative = await createCreative(workspaceId, adAccountAssetId, {
    kind,
    contentType: kind === "video" ? "video/mp4" : "image/png",
    sizeBytes: overrides.sizeBytes ?? 1024,
    metaImageHash: null,
    status: "uploading",
  });
  const upload = buildUpload({
    workspaceId,
    adAccountAssetId,
    creativeId: creative.id,
    ...overrides,
  });
  await drizzle(env.DB).insert(uploads).values(upload);
  return { creative, upload };
}
