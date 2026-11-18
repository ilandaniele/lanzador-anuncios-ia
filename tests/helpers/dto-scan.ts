const SENSITIVE_KEY =
  /token|password|secret|api_?key|key_?version|cipher|(^|_)iv$|[a-z]Iv$|hash|authorization|cookie|proof|signed_?request/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function sensitiveKeys(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const nested = Object.values(value).flatMap(sensitiveKeys);
  if (Array.isArray(value)) return nested;
  const own = Object.keys(value).filter((key) => SENSITIVE_KEY.test(key));
  return [...new Set([...own, ...nested])].sort();
}

export const leakedSecrets = (text: string, secrets: string[]) =>
  secrets.filter((secret) => text.includes(secret));

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
