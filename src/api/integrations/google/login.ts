import { z } from "zod";
import { emailSchema } from "../../../shared/schemas/auth";
import type { Env } from "../../env";
import { sha256Hex } from "../../lib/hash";
import { postFormJson } from "./client";
import {
  AUTHORIZE_URL,
  clientCredentials,
  idTokenPayload,
  type OAuthEnv,
  TOKEN_URL,
} from "./oauth";

const LOGIN_SCOPES = ["openid", "email"];
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const GMAIL_SUFFIX = "@gmail.com";

const loginTokenSchema = z.object({ id_token: z.string().min(1) });

const loginClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number(),
  nonce: z.string().optional(),
  email: emailSchema,
  email_verified: z.boolean().default(false),
  hd: z.string().optional(),
});

export type GoogleLoginClaims = z.infer<typeof loginClaimsSchema>;

const loginCallbackUrl = (env: Pick<Env, "APP_ORIGIN">) =>
  `${env.APP_ORIGIN}/api/auth/google/callback`;

export const loginNonce = (state: string) => sha256Hex(state);

export function googleLoginAuthorizeUrl(
  env: Pick<Env, "APP_ORIGIN" | "GOOGLE_CLIENT_ID">,
  state: string,
  nonce: string,
): string {
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: loginCallbackUrl(env),
    response_type: "code",
    scope: LOGIN_SCOPES.join(" "),
    prompt: "select_account",
    state,
    nonce,
  });
  return `${AUTHORIZE_URL}?${query}`;
}

export async function exchangeLoginCode(
  env: OAuthEnv,
  code: string,
): Promise<GoogleLoginClaims> {
  const grant = await postFormJson(
    TOKEN_URL,
    {
      ...clientCredentials(env),
      redirect_uri: loginCallbackUrl(env),
      grant_type: "authorization_code",
      code,
    },
    loginTokenSchema,
  );
  return idTokenPayload(grant.id_token, loginClaimsSchema);
}

export const hasValidLoginClaims = (
  claims: GoogleLoginClaims,
  expected: { clientId: string; nonce: string; at: number },
) =>
  GOOGLE_ISSUERS.includes(claims.iss) &&
  claims.aud === expected.clientId &&
  claims.exp * 1000 > expected.at &&
  claims.nonce === expected.nonce;

const emailDomain = (email: string) => email.slice(email.lastIndexOf("@") + 1);

export const isEmailAuthoritative = ({
  email,
  email_verified,
  hd,
}: GoogleLoginClaims) =>
  email_verified &&
  (email.endsWith(GMAIL_SUFFIX) ||
    (!!hd && hd.toLowerCase() === emailDomain(email)));
