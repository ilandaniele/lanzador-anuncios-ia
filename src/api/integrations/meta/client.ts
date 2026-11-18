import type { Env } from "../../env";
import { bytesToHex, hmacSha256 } from "../../lib/hash";
import { logEvent } from "../../lib/logger";
import {
  type MultipartFile,
  multipartStream,
} from "../../lib/multipart-stream";
import {
  type BatchRequest,
  type BatchResult,
  readBatchItem,
  toBatchItem,
} from "./batch";
import {
  classifyMetaError,
  invalidPayloadError,
  MetaError,
  networkMetaError,
} from "./errors";
import { assertGraphPath } from "./graph-path";
import {
  encodeForm,
  type FormValues,
  parseJson,
  type QueryValues,
  stripPaging,
  toQueryString,
} from "./payload";
import { type MetaUsage, readUsage } from "./usage";

export { MetaError } from "./errors";
export type { MetaErrorKind } from "./errors";
export type { BatchRequest, BatchResult } from "./batch";

const GRAPH_ORIGINS = {
  graph: "https://graph.facebook.com",
  video: "https://graph-video.facebook.com",
};
export const REQUEST_TIMEOUT_MS = 30_000;
export const BATCH_TIMEOUT_MS = 60_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
export const USAGE_STOP_PERCENT = 75;
const DEFAULT_THROTTLE_MS = 60_000;

type GraphEnv = Pick<Env, "GRAPH_API_VERSION" | "META_APP_SECRET">;
export type GraphHost = keyof typeof GRAPH_ORIGINS;

export interface GraphConnection {
  token: string;
  connectionId: string;
  workspaceId: string;
}

export interface GraphOptions {
  onSessionError?: (error: MetaError) => Promise<void>;
}

interface SendOptions {
  query?: QueryValues;
  form?: FormValues;
  file?: MultipartFile;
  host?: GraphHost;
  timeoutMs?: number;
  weight?: number;
}

export type Graph = ReturnType<typeof createGraph>;

const throttledError = (retryAfterMs?: number) =>
  new MetaError({
    kind: "rate_limit",
    code: 0,
    retryAfterMs: retryAfterMs ?? DEFAULT_THROTTLE_MS,
    message: `Meta usage at or above ${USAGE_STOP_PERCENT}%`,
  });

interface RequestBody {
  body: BodyInit | null;
  headers: Record<string, string>;
}

function requestBody(form: FormValues, file?: MultipartFile): RequestBody {
  if (!file) return { body: encodeForm(form), headers: {} };
  const fields = Object.fromEntries(encodeForm(form));
  const multipart = multipartStream(fields, file);
  return {
    body: multipart.body.pipeThrough(
      new FixedLengthStream(multipart.contentLength),
    ),
    headers: { "Content-Type": multipart.contentType },
  };
}

export function createGraph(
  env: GraphEnv,
  conn: GraphConnection,
  { onSessionError }: GraphOptions = {},
) {
  const baseUrl = (host: GraphHost) =>
    `${GRAPH_ORIGINS[host]}/${env.GRAPH_API_VERSION}/`;
  const appsecretProof = hmacSha256(env.META_APP_SECRET, conn.token).then(
    bytesToHex,
  );
  let calls = 0;
  let throttle: MetaError | null = null;

  function assertNotThrottled() {
    if (throttle) throw throttle;
  }

  function noteUsage(usage: MetaUsage) {
    if (usage.maxPercent >= USAGE_STOP_PERCENT) {
      throttle = throttledError(usage.retryAfterMs);
    }
  }

  function logFailure(path: string, error: MetaError) {
    logEvent("warn", "meta.request_failed", {
      connectionId: conn.connectionId,
      workspaceId: conn.workspaceId,
      path,
      kind: error.kind,
      code: error.code,
      subcode: error.subcode,
    });
  }

  async function reportSession(error: MetaError | undefined) {
    if (!error || !onSessionError) return;
    try {
      await onSessionError(error);
    } catch {
      logEvent("error", "meta.session_hook_failed", {
        connectionId: conn.connectionId,
      });
    }
  }

  async function fail(path: string, error: MetaError): Promise<never> {
    logFailure(path, error);
    await reportSession(error.kind === "session" ? error : undefined);
    throw error;
  }

  async function attempt<T>(path: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (cause) {
      return fail(path, networkMetaError(cause));
    }
  }

  async function send(
    method: "GET" | "POST",
    path: string,
    {
      query = {},
      form,
      file,
      host = "graph",
      timeoutMs = REQUEST_TIMEOUT_MS,
      weight = 1,
    }: SendOptions,
  ): Promise<unknown> {
    assertNotThrottled();
    const proof = await appsecretProof;
    assertNotThrottled();
    const url = new URL(`${baseUrl(host)}${path}`);
    url.search = toQueryString(
      form ? query : { ...query, appsecret_proof: proof },
    );
    const { body, headers }: RequestBody = form
      ? requestBody({ ...form, appsecret_proof: proof }, file)
      : { body: null, headers: {} };

    calls += weight;
    const response = await attempt(path, () =>
      fetch(url, {
        method,
        headers: { ...headers, Authorization: `Bearer ${conn.token}` },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      }),
    );
    const usage = readUsage(response.headers);
    noteUsage(usage);
    const payload = parseJson(await attempt(path, () => response.text()));
    if (!response.ok) {
      return fail(
        path,
        classifyMetaError(response.status, payload, usage.retryAfterMs),
      );
    }
    if (payload === null) return fail(path, invalidPayloadError());
    return stripPaging(payload);
  }

  return {
    get: async <T>(path: string, params?: QueryValues) =>
      (await send("GET", assertGraphPath(path), { query: params })) as T,

    post: async <T>(path: string, form: FormValues, host?: GraphHost) =>
      (await send("POST", assertGraphPath(path), { form, host })) as T,

    upload: async <T>(
      path: string,
      form: FormValues,
      file: MultipartFile,
      host?: GraphHost,
    ) =>
      (await send("POST", assertGraphPath(path), {
        form,
        file,
        host,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      })) as T,

    async batch<T>(requests: BatchRequest[]): Promise<BatchResult<T>[]> {
      const batch = requests.map(toBatchItem);
      const payload = await send("POST", "", {
        form: { batch, include_headers: true },
        timeoutMs: BATCH_TIMEOUT_MS,
        weight: requests.length,
      });
      if (!Array.isArray(payload) || payload.length !== requests.length) {
        return fail("", invalidPayloadError());
      }
      const items = payload.map((item) => readBatchItem<T>(item));
      items.forEach(({ usage }) => noteUsage(usage));
      const failures = items.flatMap(({ result }, index) =>
        result.ok ? [] : [{ error: result.error, index }],
      );
      for (const { error, index } of failures) {
        logFailure(requests[index]?.path ?? "", error);
        if (error.kind === "rate_limit") {
          throttle = throttledError(error.retryAfterMs);
        }
      }
      await reportSession(
        failures.find(({ error }) => error.kind === "session")?.error,
      );
      return items.map(({ result }) => result);
    },

    callCount: () => calls,
  };
}
