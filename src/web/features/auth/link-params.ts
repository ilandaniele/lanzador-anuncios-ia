const PROTOCOL_RELATIVE = /^\/[/\\]/;

export function readFragmentToken(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, "")).get("t");
}

export function safeNext(next: string | null): string | null {
  const isLocalPath =
    next !== null && next.startsWith("/") && !PROTOCOL_RELATIVE.test(next);
  return isLocalPath ? next : null;
}
