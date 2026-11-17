const SENSITIVE_KEY =
  /token|authorization|cookie|secret|password|key|signature|signed_request|session|link|^sid$|^(auth|oauth)_?code$/i;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(https?:\/\/[^\s?#]+)[?#]\S*/gi, "$1"],
  [/Bearer\s+\S+/gi, "Bearer [redacted]"],
  [/EAA[A-Za-z0-9]+/g, "[redacted]"],
  [
    /(\w*(?:token|secret|password|code|signed_request|key))=\S+/gi,
    "$1=[redacted]",
  ],
];

export type LogLevel = "info" | "warn" | "error";

export function scrub(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

function redact(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  return typeof value === "string" ? scrub(value) : value;
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  try {
    console.log(JSON.stringify({ level, event, ...fields }, redact));
  } catch {
    // Logging must never break the request that is being logged.
  }
}
