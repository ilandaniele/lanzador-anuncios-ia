import type { GoogleLoginFailure } from "../../../shared/schemas/auth";
import { metaCallbackQuerySchema as oauthCallbackQuerySchema } from "../../../shared/schemas/meta-oauth";
import type { Env } from "../../env";
import { GoogleError } from "../../integrations/google/client";
import {
  exchangeLoginCode,
  googleLoginAuthorizeUrl,
  hasValidLoginClaims,
  isEmailAuthoritative,
  loginNonce,
} from "../../integrations/google/login";
import { randomToken, timingSafeEqual } from "../../lib/hash";
import { logEvent, scrub } from "../../lib/logger";
import { now } from "../../lib/time";
import { isReviewerEmail } from "./emails";
import { signInVerifiedEmail } from "./login";
import type { SessionMeta } from "./session";

export const GOOGLE_STATE_COOKIE = "__Host-lanzador_gstate";

const STATE_TTL_SEC = 600;
const HOME_PATH = "/";

type LoginEnv = Pick<
  Env,
  | "DB"
  | "APP_ORIGIN"
  | "SUPERADMIN_EMAIL"
  | "REVIEWER_EMAIL"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
>;

type LoginRequest = {
  rawQuery: Record<string, string>;
  stateCookie: string | undefined;
  meta: SessionMeta;
  requestId: string;
};

type LoginResult = { path: string; sessionCookie?: string };

class LoginFailure extends Error {
  constructor(readonly reason: GoogleLoginFailure) {
    super(reason);
  }
}

const buildStateCookie = (value: string, maxAgeSec: number) =>
  `${GOOGLE_STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

export const clearGoogleStateCookie = () => buildStateCookie("", 0);

const failurePath = (reason: GoogleLoginFailure) =>
  `/login?google=error&motivo=${reason}`;

export async function startGoogleLogin(
  env: Pick<Env, "APP_ORIGIN" | "GOOGLE_CLIENT_ID">,
): Promise<{ redirectUrl: string; stateCookie?: string }> {
  if (!env.GOOGLE_CLIENT_ID.trim()) {
    logEvent("error", "google.login_not_configured", {});
    return { redirectUrl: failurePath("INTERNAL") };
  }
  const state = randomToken(32);
  return {
    redirectUrl: googleLoginAuthorizeUrl(env, state, await loginNonce(state)),
    stateCookie: buildStateCookie(state, STATE_TTL_SEC),
  };
}

async function exchangeOrFail(env: LoginEnv, code: string, requestId: string) {
  try {
    return await exchangeLoginCode(env, code);
  } catch (error) {
    logEvent("warn", "google.login_exchange_failed", {
      requestId,
      status: error instanceof GoogleError ? error.status : undefined,
      code: error instanceof GoogleError ? error.code : undefined,
    });
    throw new LoginFailure("TOKEN_EXCHANGE_FAILED");
  }
}

async function verifiedEmail(
  env: LoginEnv,
  { rawQuery, stateCookie, requestId }: LoginRequest,
): Promise<string> {
  const query = oauthCallbackQuerySchema.safeParse(rawQuery);
  const state = query.success ? query.data.state : undefined;
  if (!query.success || !state || !stateCookie) {
    throw new LoginFailure("STATE_INVALID");
  }
  if (!timingSafeEqual(stateCookie, state)) {
    throw new LoginFailure("STATE_INVALID");
  }
  const { code, error } = query.data;
  if (error || !code) throw new LoginFailure("GOOGLE_DENIED");

  const claims = await exchangeOrFail(env, code, requestId);
  const valid = hasValidLoginClaims(claims, {
    clientId: env.GOOGLE_CLIENT_ID,
    nonce: await loginNonce(state),
    at: now(),
  });
  if (!valid) {
    logEvent("warn", "google.login_claims_invalid", { requestId });
    throw new LoginFailure("TOKEN_EXCHANGE_FAILED");
  }
  if (!isEmailAuthoritative(claims)) throw new LoginFailure("EMAIL_UNVERIFIED");
  return claims.email;
}

async function signIn(env: LoginEnv, request: LoginRequest): Promise<string> {
  const email = await verifiedEmail(env, request);
  if (isReviewerEmail(env, email)) throw new LoginFailure("NOT_ALLOWED");
  const signedIn = await signInVerifiedEmail(env, email, request.meta, {
    allowNewUser: true,
  });
  if (!signedIn) throw new LoginFailure("NOT_ALLOWED");
  return signedIn.cookie;
}

function failureReason(error: unknown, requestId: string): GoogleLoginFailure {
  if (error instanceof LoginFailure) return error.reason;
  logEvent("error", "google.login_failed", {
    requestId,
    message: scrub(error instanceof Error ? error.message : String(error)),
  });
  return "INTERNAL";
}

export async function completeGoogleLogin(
  env: LoginEnv,
  request: LoginRequest,
): Promise<LoginResult> {
  try {
    return { path: HOME_PATH, sessionCookie: await signIn(env, request) };
  } catch (error) {
    return { path: failurePath(failureReason(error, request.requestId)) };
  }
}
