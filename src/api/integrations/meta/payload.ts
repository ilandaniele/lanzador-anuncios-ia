export type FormValues = Record<string, unknown>;
export type QueryValues = Record<string, string | number | boolean>;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function encodeForm(values: FormValues): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return form;
}

export const toQueryString = (query: QueryValues = {}) =>
  new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  ).toString();

export function stripPaging(payload: unknown): unknown {
  if (!isRecord(payload) || !isRecord(payload.paging)) return payload;
  const paging = { ...payload.paging };
  delete paging.next;
  delete paging.previous;
  return { ...payload, paging };
}
