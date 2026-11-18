import type { AiImage } from "../ai/provider";
import { AppError } from "../../lib/errors";
import { parseSafeUrl } from "../../lib/safe-url";

const THUMBNAIL_HOST_SUFFIX = ".fbcdn.net";
const THUMBNAIL_TIMEOUT_MS = 15_000;
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

const untrustedThumbnail = () =>
  new AppError(502, "META_ERROR", { message: "Untrusted thumbnail URL" });

const unavailableThumbnail = () =>
  new AppError(502, "META_ERROR", { message: "Thumbnail unavailable" });

export function parseThumbnailUrl(raw: string): URL {
  const result = parseSafeUrl(raw);
  if (
    "rejection" in result ||
    !result.url.hostname.endsWith(THUMBNAIL_HOST_SUFFIX)
  ) {
    throw untrustedThumbnail();
  }
  return result.url;
}

export async function fetchMetaThumbnail(raw: string): Promise<AiImage> {
  const url = parseThumbnailUrl(raw);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS),
  }).catch(() => {
    throw unavailableThumbnail();
  });
  const mimeType = response.headers.get("Content-Type")?.split(";")[0];
  if (!response.ok || !mimeType?.startsWith("image/")) {
    throw unavailableThumbnail();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > THUMBNAIL_MAX_BYTES) {
    throw unavailableThumbnail();
  }
  return { bytes, mimeType };
}
