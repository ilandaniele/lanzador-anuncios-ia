import type { CheckLandingResponse } from "../../shared/schemas/products";
import { parseSafeUrl } from "../lib/safe-url";
import { now } from "../lib/time";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SOFT_STATUSES = new Set([401, 403, 429]);

export interface LandingCheckOptions {
  timeoutMs?: number;
  blockedHosts?: readonly string[];
}

const classify = (httpStatus: number) => {
  if (httpStatus < 400) return "ok";
  return SOFT_STATUSES.has(httpStatus) ? "soft_ok" : "error";
};

const discardBody = (response: Response) =>
  response.body?.cancel().catch(() => undefined);

export async function checkLanding(
  landingUrl: string,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = DEFAULT_TIMEOUT_MS, blockedHosts }: LandingCheckOptions = {},
): Promise<CheckLandingResponse> {
  const startedAt = now();
  const signal = AbortSignal.timeout(timeoutMs);
  let finalUrl = landingUrl;
  let target = landingUrl;

  const failure = (error: string): CheckLandingResponse => ({
    status: "error",
    httpStatus: null,
    finalUrl,
    ms: now() - startedAt,
    error,
  });

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const safe = parseSafeUrl(target, { base: finalUrl, blockedHosts });
    if ("rejection" in safe) return failure(safe.rejection);
    finalUrl = safe.url.href;

    let response: Response;
    try {
      response = await fetchImpl(finalUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html,*/*" },
        signal,
      });
    } catch {
      return failure(signal.aborted ? "timeout" : "network");
    }
    await discardBody(response);

    const location = response.headers.get("Location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      const status = classify(response.status);
      return {
        status,
        httpStatus: response.status,
        finalUrl,
        ms: now() - startedAt,
        ...(status === "error" ? { error: `http_${response.status}` } : {}),
      };
    }
    target = location;
  }
  return failure("too_many_redirects");
}
