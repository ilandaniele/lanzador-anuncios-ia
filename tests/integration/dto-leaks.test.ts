import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { http, HttpResponse } from "msw";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import type { Env } from "../../src/api/env";
import { newId } from "../../src/api/lib/ids";
import { now } from "../../src/api/lib/time";
import { encryptToken } from "../../src/api/lib/token-crypto";
import { googleTokenAad } from "../../src/api/services/google/connection";
import { magicLinks, sessions } from "../../src/db/schema/auth";
import { googleConnections, metaConnections } from "../../src/db/schema/meta";
import { dataDeletionRequests } from "../../src/db/schema/ops";
import { invitations, oauthStates } from "../../src/db/schema/workspaces";
import { leakedSecrets, parseJson, sensitiveKeys } from "../helpers/dto-scan";
import { createChatMessage, createUser, loginAs } from "../helpers/factory";
import { googleAccessToken } from "../helpers/msw/google";
import { GRAPH_BASE_URL } from "../helpers/msw/meta";
import { server } from "../helpers/msw/server";
import { fillPath, routeKeys, splitRouteKey } from "../helpers/route-walk";
import { seedTenantPair, type TenantPair } from "../helpers/tenant-pair";
import { openLimiter, testEnv } from "./pipeline/helpers";

type Tenant = TenantPair["A"];
type RouteRequest = {
  params?: Record<string, string>;
  query?: Record<string, string>;
};

const META_TOKEN = "tenant-seed-token";
const GOOGLE_REFRESH_TOKEN = "1//dto-leak-google-refresh-token";
const GOOGLE_ACCESS_TOKEN = "ya29.dto-leak-picker-access-token";
const CAMPAIGN_ID = "120200000000000001";
const AD_ID = "120200000000000002";
const DELETION_CODE = newId().slice(0, 16);
const PREVIEW_IFRAME =
  '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=abc"></iframe>';

const routeEnv = {
  GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "dto-leak-google-client-secret",
  GOOGLE_PICKER_API_KEY: "dto-leak-public-picker-key",
  RESEND_API_KEY: "re_dto-leak-resend-api-key",
  E2E_SECRET: "dto-leak-e2e-secret",
  RL_IP: openLimiter,
  RL_USER: openLimiter,
  RL_AUTH: openLimiter,
  RL_EXP: openLimiter,
} satisfies Partial<Env>;

const ENV_SECRETS = [
  env.META_APP_SECRET,
  env.TOKEN_ENC_KEY_V1,
  routeEnv.GOOGLE_CLIENT_SECRET,
  routeEnv.RESEND_API_KEY,
  routeEnv.E2E_SECRET,
];

const PUBLIC_BY_DESIGN: Record<string, string[]> = {
  "GET /api/w/:wid/google/picker-token": ["accessToken", "apiKey"],
  "GET /api/w/:wid/launches/:id": ["planHash"],
  "GET /api/w/:wid/meta/connections": ["tokenExpiresAt"],
};

const withAdAccount = ({ adAccount }: Tenant) => ({
  query: { adAccountAssetId: adAccount.id },
});

const ROUTE_REQUESTS: Record<string, (tenant: Tenant) => RouteRequest> = {
  "GET /api/meta/data-deletion/:code": () => ({
    params: { code: DELETION_CODE },
  }),
  "GET /api/w/:wid/metrics/winning-tags": () => ({
    query: { dimension: "hook" },
  }),
  "GET /api/w/:wid/chat/sessions/:id/messages": ({ chatSession }) => ({
    params: { id: chatSession.id },
  }),
  "GET /api/w/:wid/creatives/:id": ({ creative }) => ({
    params: { id: creative.id },
  }),
  "GET /api/w/:wid/launches/:id": ({ launch }) => ({
    params: { id: launch.id },
  }),
  "GET /api/w/:wid/launches/:id/progress": ({ launch }) => ({
    params: { id: launch.id },
  }),
  "GET /api/w/:wid/products/:id": ({ product }) => ({
    params: { id: product.id },
  }),
  "GET /api/w/:wid/products/:id/copies": ({ product }) => ({
    params: { id: product.id },
  }),
  "GET /api/w/:wid/meta/ad-accounts/:assetId/campaigns": ({ adAccount }) => ({
    params: { assetId: adAccount.id },
  }),
  "GET /api/w/:wid/meta/campaigns/:campaignId/reference": (tenant) => ({
    ...withAdAccount(tenant),
    params: { campaignId: CAMPAIGN_ID },
  }),
  "GET /api/w/:wid/meta/campaigns/:campaignId/ads": (tenant) => ({
    ...withAdAccount(tenant),
    params: { campaignId: CAMPAIGN_ID },
  }),
  "GET /api/w/:wid/meta/ads/:adId/preview": (tenant) => ({
    ...withAdAccount(tenant),
    params: { adId: AD_ID },
  }),
};

const app = createApp();
const db = drizzle(env.DB);
const getRoutes = routeKeys(app).filter((key) => key.startsWith("GET "));

const encodings = (bytes: Uint8Array) =>
  (["base64", "base64url", "hex"] as const).map((encoding) =>
    Buffer.from(bytes).toString(encoding),
  );

async function seedGoogleConnection({ workspace, users }: Tenant) {
  const id = newId();
  const scope = { workspaceId: workspace.id, userId: users.owner.id };
  const sealed = await encryptToken(
    env,
    GOOGLE_REFRESH_TOKEN,
    googleTokenAad(scope, id),
  );
  await db.insert(googleConnections).values({
    id,
    ...scope,
    googleEmail: "owner@example.test",
    refreshTokenCiphertext: Buffer.from(sealed.ciphertext),
    refreshTokenIv: Buffer.from(sealed.iv),
    tokenKeyVersion: sealed.keyVersion,
    scopes: JSON.stringify(["https://www.googleapis.com/auth/drive.file"]),
    createdAt: now(),
    updatedAt: now(),
  });
}

const seedDeletionRequest = () =>
  db.insert(dataDeletionRequests).values({
    id: newId(),
    confirmationCode: DELETION_CODE,
    metaUserId: newId(),
    createdAt: now(),
  });

const graphObject = ({ adAccount }: Tenant) => ({
  id: CAMPAIGN_ID,
  account_id: adAccount.metaId.replace(/^act_/, ""),
  daily_budget: "8000",
  bid_strategy: "COST_CAP",
  adsets: {
    data: [
      {
        id: "120200000000000201",
        name: "CONJ 1",
        effective_status: "ACTIVE",
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { pixel_id: "555", custom_event_type: "PURCHASE" },
        targeting: { geo_locations: { countries: ["AR"] } },
      },
    ],
  },
  ads: {
    data: [{ id: AD_ID, name: "Anuncio 1", effective_status: "ACTIVE" }],
  },
  previews: { data: [{ body: PREVIEW_IFRAME }] },
  data: [],
});

async function storedSecrets() {
  const [meta, google, sessionRows, linkRows, invitationRows, stateRows] =
    await db.batch([
      db
        .select({
          ciphertext: metaConnections.tokenCiphertext,
          iv: metaConnections.tokenIv,
        })
        .from(metaConnections),
      db
        .select({
          ciphertext: googleConnections.refreshTokenCiphertext,
          iv: googleConnections.refreshTokenIv,
        })
        .from(googleConnections),
      db.select({ hash: sessions.tokenHash }).from(sessions),
      db.select({ hash: magicLinks.tokenHash }).from(magicLinks),
      db.select({ hash: invitations.tokenHash }).from(invitations),
      db.select({ hash: oauthStates.stateHash }).from(oauthStates),
    ]);
  const sealed = [...meta, ...google].flatMap(({ ciphertext, iv }) => [
    ...encodings(ciphertext),
    ...encodings(iv),
  ]);
  const hashes = [
    ...sessionRows,
    ...linkRows,
    ...invitationRows,
    ...stateRows,
  ].map(({ hash }) => hash);
  return [...sealed, ...hashes];
}

describe("DTO leaks", { timeout: 60_000 }, () => {
  let tenant: Tenant;
  let cookies: { owner: string; superadmin: string };
  let secrets: string[];

  beforeAll(async () => {
    const [{ A }, superadmin] = await Promise.all([
      seedTenantPair(),
      createUser({ isSuperadmin: 1 }),
    ]);
    tenant = A;
    await Promise.all([
      seedGoogleConnection(A),
      seedDeletionRequest(),
      createChatMessage(A.workspace.id, A.chatSession.id, "user"),
    ]);
    const [owner, admin] = await Promise.all([
      loginAs(A.users.owner),
      loginAs(superadmin),
    ]);
    cookies = { owner: owner.cookie, superadmin: admin.cookie };
    const sessionTokens = [owner, admin].map(
      ({ cookie }) => cookie.split("=")[1]!,
    );
    secrets = [
      META_TOKEN,
      GOOGLE_REFRESH_TOKEN,
      ...ENV_SECRETS,
      ...sessionTokens,
      ...(await storedSecrets()),
    ];
  });

  beforeEach(() => {
    server.use(
      googleAccessToken(GOOGLE_ACCESS_TOKEN),
      http.all(`${GRAPH_BASE_URL}/*`, () =>
        HttpResponse.json(graphObject(tenant)),
      ),
    );
  });

  async function fetchRoute(key: string) {
    const { path } = splitRouteKey(key);
    const { params, query } = ROUTE_REQUESTS[key]?.(tenant) ?? {};
    const url = fillPath(path, { ...params, wid: tenant.workspace.id });
    const queryString = new URLSearchParams(query).toString();
    const response = await app.request(
      queryString ? `${url}?${queryString}` : url,
      {
        headers: {
          Cookie: path.startsWith("/api/admin/")
            ? cookies.superadmin
            : cookies.owner,
        },
      },
      testEnv(routeEnv),
    );
    const body = await response.text();
    return {
      status: response.status,
      text: `${body}\n${response.headers.get("Location") ?? ""}`,
      json: parseJson(body),
    };
  }

  it("collects real secret values to look for", () => {
    expect(secrets.length).toBeGreaterThan(15);
    expect(secrets.filter((secret) => secret.length < 12)).toEqual([]);
  });

  it("finds every GET route", () => {
    expect(getRoutes.length).toBeGreaterThan(35);
  });

  it.each(getRoutes)("%s answers without secrets", async (key) => {
    const { status, text, json } = await fetchRoute(key);
    const allowed = PUBLIC_BY_DESIGN[key] ?? [];

    expect(status).toBeLessThan(400);
    expect(
      sensitiveKeys(json).filter((name) => !allowed.includes(name)),
    ).toEqual([]);
    expect(leakedSecrets(text, secrets)).toEqual([]);
  });
});
