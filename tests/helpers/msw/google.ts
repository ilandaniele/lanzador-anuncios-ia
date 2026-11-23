import { http, HttpResponse, type JsonBodyType } from "msw";
import { base64urlEncode } from "../../../src/api/lib/hash";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const encodeJson = (value: unknown) =>
  base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));

export const idTokenFor = (claims: Record<string, unknown>) =>
  [
    encodeJson({ alg: "RS256", typ: "JWT" }),
    encodeJson(claims),
    "signature",
  ].join(".");

export const fakeIdToken = (email: string) =>
  idTokenFor({ iss: "https://accounts.google.com", email });

export const googleTokenReplies = (body: JsonBodyType, status = 200) =>
  http.post(GOOGLE_TOKEN_URL, () => HttpResponse.json(body, { status }));

export const googleCodeExchange = ({
  refreshToken,
  email,
  scope = `${DRIVE_FILE_SCOPE} openid https://www.googleapis.com/auth/userinfo.email`,
}: {
  refreshToken: string;
  email: string;
  scope?: string;
}) =>
  googleTokenReplies({
    access_token: "ya29.exchange-access",
    expires_in: 3599,
    refresh_token: refreshToken,
    scope,
    token_type: "Bearer",
    id_token: fakeIdToken(email),
  });

export const googleAccessToken = (accessToken: string, expiresIn = 3599) =>
  googleTokenReplies({
    access_token: accessToken,
    expires_in: expiresIn,
    scope: DRIVE_FILE_SCOPE,
    token_type: "Bearer",
  });

export const googleTokenFails = (error: string, status = 400) =>
  googleTokenReplies({ error, error_description: "failure" }, status);

export const googleServerError = (url: string) =>
  http.post(url, () => new HttpResponse("upstream", { status: 500 }));

export const googleRevokes = (status = 200) =>
  http.post(GOOGLE_REVOKE_URL, () => new HttpResponse(null, { status }));

export const googleLoginExchange = (claims: Record<string, unknown>) =>
  googleTokenReplies({
    access_token: "ya29.login-access",
    expires_in: 3599,
    scope: "openid https://www.googleapis.com/auth/userinfo.email",
    token_type: "Bearer",
    id_token: idTokenFor(claims),
  });
