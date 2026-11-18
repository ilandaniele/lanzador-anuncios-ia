import { z } from "zod";

export const GOOGLE_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;

const errorPayloadSchema = z.object({ error: z.string() });

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(code ?? `google_${status}`);
    this.name = "GoogleError";
  }
}

async function fetchOnce(url: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleError(0, "network");
  }
}

export async function googleFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response = await fetchOnce(url, init);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    if (response.status < 500) break;
    response = await fetchOnce(url, init);
  }
  return response;
}

export const postForm = (url: string, form: Record<string, string>) =>
  googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });

export async function postFormJson<S extends z.ZodType>(
  url: string,
  form: Record<string, string>,
  schema: S,
): Promise<z.infer<S>> {
  const response = await postForm(url, form);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorPayloadSchema.safeParse(payload);
    throw new GoogleError(
      response.status,
      error.success ? error.data.error : undefined,
    );
  }
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new GoogleError(response.status, "invalid_payload");
  return result.data;
}
