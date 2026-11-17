const encoder = new TextEncoder();

type Bytes = string | Uint8Array;

function toBytes(value: Bytes): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function base64urlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export async function sha256Hex(value: Bytes): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(value));
  return bytesToHex(new Uint8Array(digest));
}

export function randomToken(bytes = 32): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hmacSha256(
  key: Bytes,
  message: Bytes,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toBytes(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, toBytes(message));
  return new Uint8Array(mac);
}

export function timingSafeEqual(a: Bytes, b: Bytes): boolean {
  const left = toBytes(a);
  const right = toBytes(b);
  let difference = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) {
    difference |= left[i]! ^ (right[i % right.length] ?? 0);
  }
  return difference === 0;
}
