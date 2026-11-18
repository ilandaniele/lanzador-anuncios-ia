import type { ErrorCode } from "../../shared/errors";
import { errorEnvelopeSchema } from "../../shared/schemas/common";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;
  readonly requestId: string;

  constructor(init: {
    status: number;
    code: ErrorCode;
    message: string;
    requestId: string;
    fields?: Record<string, string>;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.details = init.details;
    this.requestId = init.requestId;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("X-Request-Id") ?? "";
  const envelope = errorEnvelopeSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (envelope.success)
    return new ApiError({
      status: response.status,
      ...envelope.data.error,
    });
  return new ApiError({
    status: response.status,
    code: "INTERNAL",
    message: response.statusText,
    requestId,
  });
}

export async function apiFetch<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("X-Lanzador", "1");
  const rawBody = body instanceof Blob ? body : undefined;
  if (body !== undefined && !rawBody)
    headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...rest,
    headers,
    credentials: "same-origin",
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
