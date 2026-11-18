import { z } from "zod";
import type { Env } from "../../env";
import { logEvent } from "../../lib/logger";
import {
  classifyMetaError,
  invalidPayloadError,
  networkMetaError,
} from "./errors";
import { parseJson, type QueryValues, toQueryString } from "./payload";
import type { GranularScope } from "./read";

const GRAPH_ORIGIN = "https://graph.facebook.com";
const DIALOG_ORIGIN = "https://www.facebook.com";
export const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;

type AuthEnv = Pick<
  Env,
  "APP_ORIGIN" | "GRAPH_API_VERSION" | "META_APP_ID" | "META_APP_SECRET"
>;

const accessTokenSchema = z.object({ access_token: z.string().min(1) });

const debugTokenSchema = z.object({
  data: z.object({
    is_valid: z.boolean(),
    app_id: z.string(),
    type: z.string().optional(),
    scopes: z.array(z.string()).default([]),
    granular_scopes: z
      .array(
        z.object({
          scope: z.string(),
          target_ids: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    expires_at: z.number().default(0),
  }),
});

export interface TokenInfo {
  isValid: boolean;
  appId: string;
  type?: string;
  scopes: string[];
  granularScopes: GranularScope[];
  expiresAt: number | null;
}

export const metaCallbackUrl = (env: Pick<Env, "APP_ORIGIN">) =>
  `${env.APP_ORIGIN}/api/meta/oauth/callback`;

export function metaAuthorizeUrl(
  env: Pick<
    Env,
    "APP_ORIGIN" | "GRAPH_API_VERSION" | "META_APP_ID" | "META_LOGIN_CONFIG_ID"
  >,
  state: string,
): string {
  const query = toQueryString({
    client_id: env.META_APP_ID,
    redirect_uri: metaCallbackUrl(env),
    config_id: env.META_LOGIN_CONFIG_ID,
    state,
    response_type: "code",
    override_default_response_type: true,
  });
  return `${DIALOG_ORIGIN}/${env.GRAPH_API_VERSION}/dialog/oauth?${query}`;
}

async function fetchOnce(url: URL, headers: HeadersInit) {
  try {
    return await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
    });
  } catch (cause) {
    throw networkMetaError(cause);
  }
}

async function fetchWithRetry(url: URL, headers: HeadersInit) {
  let response = await fetchOnce(url, headers);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    if (response.status < 500) break;
    response = await fetchOnce(url, headers);
  }
  return response;
}

async function getJson<S extends z.ZodType>(
  env: AuthEnv,
  path: string,
  query: QueryValues,
  schema: S,
  headers: HeadersInit = {},
): Promise<z.infer<S>> {
  const url = new URL(`${GRAPH_ORIGIN}/${env.GRAPH_API_VERSION}/${path}`);
  url.search = toQueryString(query);
  const response = await fetchWithRetry(url, headers);
  const payload = parseJson(await response.text().catch(() => null));
  if (!response.ok) {
    const error = classifyMetaError(response.status, payload);
    logEvent("warn", "meta.auth_failed", {
      path,
      status: response.status,
      kind: error.kind,
      code: error.code,
    });
    throw error;
  }
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

async function requestAccessToken(
  env: AuthEnv,
  query: QueryValues,
): Promise<string> {
  const { access_token } = await getJson(
    env,
    "oauth/access_token",
    {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      ...query,
    },
    accessTokenSchema,
  );
  return access_token;
}

export const exchangeCode = (env: AuthEnv, code: string) =>
  requestAccessToken(env, { redirect_uri: metaCallbackUrl(env), code });

export const exchangeLongLived = (env: AuthEnv, shortLivedToken: string) =>
  requestAccessToken(env, {
    grant_type: "fb_exchange_token",
    fb_exchange_token: shortLivedToken,
  });

export async function debugToken(
  env: AuthEnv,
  token: string,
): Promise<TokenInfo> {
  const { data } = await getJson(
    env,
    "debug_token",
    { input_token: token },
    debugTokenSchema,
    { Authorization: `Bearer ${env.META_APP_ID}|${env.META_APP_SECRET}` },
  );
  return {
    isValid: data.is_valid,
    appId: data.app_id,
    type: data.type,
    scopes: data.scopes,
    granularScopes: data.granular_scopes,
    expiresAt: data.expires_at > 0 ? data.expires_at * 1000 : null,
  };
}
