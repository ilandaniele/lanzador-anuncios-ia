import {
  classifyMetaError,
  invalidPayloadError,
  type MetaError,
  networkMetaError,
} from "./errors";
import { assertGraphPath } from "./graph-path";
import {
  encodeForm,
  type FormValues,
  isRecord,
  parseJson,
  type QueryValues,
  stripPaging,
  toQueryString,
} from "./payload";
import { type HeaderSource, type MetaUsage, readUsage } from "./usage";

export interface BatchRequest {
  method: "GET" | "POST";
  path: string;
  query?: QueryValues;
  body?: FormValues;
}

export type BatchResult<T> =
  { ok: true; data: T } | { ok: false; error: MetaError };

export interface BatchItem<T> {
  result: BatchResult<T>;
  usage: MetaUsage;
}

interface HeaderPair {
  name: string;
  value: string;
}

const NO_USAGE: MetaUsage = { maxPercent: 0 };

export function toBatchItem({ method, path, query, body }: BatchRequest) {
  const search = toQueryString(query);
  const safePath = assertGraphPath(path);
  return {
    method,
    relative_url: search ? `${safePath}?${search}` : safePath,
    body: body ? encodeForm(body).toString() : undefined,
  };
}

const isHeaderPair = (value: unknown): value is HeaderPair =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.value === "string";

function itemHeaders(value: unknown): HeaderSource {
  const pairs = Array.isArray(value) ? value.filter(isHeaderPair) : [];
  return {
    get: (name) =>
      pairs.find((pair) => pair.name.toLowerCase() === name)?.value ?? null,
  };
}

const failed = <T>(error: MetaError, usage: MetaUsage): BatchItem<T> => ({
  result: { ok: false, error },
  usage,
});

export function readBatchItem<T>(item: unknown): BatchItem<T> {
  if (!isRecord(item) || typeof item.code !== "number") {
    return failed(networkMetaError(null), NO_USAGE);
  }
  const usage = readUsage(itemHeaders(item.headers));
  const payload = parseJson(typeof item.body === "string" ? item.body : null);
  if (item.code >= 400) {
    return failed(
      classifyMetaError(item.code, payload, usage.retryAfterMs),
      usage,
    );
  }
  if (payload === null) return failed(invalidPayloadError(), usage);
  return { result: { ok: true, data: stripPaging(payload) as T }, usage };
}
