import { z } from "zod";
import type { Env } from "../../env";
import { base64urlDecode } from "../../lib/hash";
import { GoogleError, postForm, postFormJson } from "./client";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_SCOPES = [DRIVE_FILE_SCOPE, "openid", "email"];

type OAuthEnv = Pick<
  Env,
  "APP_ORIGIN" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"
>;

const codeExchangeSchema = z.object({
  refresh_token: z.string().min(1),
  scope: z.string(),
  id_token: z.string().min(1),
});

const accessTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

const idTokenClaimsSchema = z.object({ email: z.email() });

export interface GoogleGrant {
  refreshToken: string;
  email: string;
  scopes: string[];
}

export interface GoogleAccessToken {
  accessToken: string;
  expiresAt: number;
}

const googleCallbackUrl = (env: Pick<Env, "APP_ORIGIN">) =>
  `${env.APP_ORIGIN}/api/google/oauth/callback`;

const clientCredentials = (env: OAuthEnv) => ({
  client_id: env.GOOGLE_CLIENT_ID,
  client_secret: env.GOOGLE_CLIENT_SECRET,
});

export function googleAuthorizeUrl(
  env: Pick<Env, "APP_ORIGIN" | "GOOGLE_CLIENT_ID">,
  state: string,
): string {
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleCallbackUrl(env),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTHORIZE_URL}?${query}`;
}

function emailFromIdToken(idToken: string): string {
  try {
    const payload = new TextDecoder().decode(
      base64urlDecode(idToken.split(".")[1] ?? ""),
    );
    return idTokenClaimsSchema.parse(JSON.parse(payload)).email;
  } catch {
    throw new GoogleError(200, "invalid_id_token");
  }
}

export async function exchangeCode(
  env: OAuthEnv,
  code: string,
): Promise<GoogleGrant> {
  const grant = await postFormJson(
    TOKEN_URL,
    {
      ...clientCredentials(env),
      redirect_uri: googleCallbackUrl(env),
      grant_type: "authorization_code",
      code,
    },
    codeExchangeSchema,
  );
  return {
    refreshToken: grant.refresh_token,
    email: emailFromIdToken(grant.id_token),
    scopes: grant.scope.split(" ").filter(Boolean),
  };
}

export async function refreshAccessToken(
  env: OAuthEnv,
  refreshToken: string,
  at: number,
): Promise<GoogleAccessToken> {
  const token = await postFormJson(
    TOKEN_URL,
    {
      ...clientCredentials(env),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: DRIVE_FILE_SCOPE,
    },
    accessTokenSchema,
  );
  return {
    accessToken: token.access_token,
    expiresAt: at + token.expires_in * 1000,
  };
}

export async function revokeToken(token: string): Promise<boolean> {
  const response = await postForm(REVOKE_URL, { token });
  return response.ok;
}
