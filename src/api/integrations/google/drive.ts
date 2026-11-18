import { z } from "zod";
import { GOOGLE_TIMEOUT_MS, GoogleError } from "./client";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_RANGE_TIMEOUT_MS = 120_000;

const fileUrl = (fileId: string, query: string) =>
  `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${query}&supportsAllDrives=true`;

const fileMetadataSchema = z.object({
  size: z.string().regex(/^\d+$/).transform(Number).optional(),
  mimeType: z.string().toLowerCase(),
});

export type DriveFileMetadata = z.infer<typeof fileMetadataSchema>;

async function fetchWithTimeouts(
  url: string,
  init: RequestInit,
  totalTimeoutMs: number,
) {
  const firstByte = new AbortController();
  const timer = setTimeout(() => firstByte.abort(), GOOGLE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.any([
        firstByte.signal,
        AbortSignal.timeout(totalTimeoutMs),
      ]),
    });
  } catch {
    throw new GoogleError(0, "network");
  } finally {
    clearTimeout(timer);
  }
}

const bearer = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

async function failWith(response: Response, status = response.status) {
  await response.body?.cancel();
  return new GoogleError(status);
}

export async function readDriveMetadata(
  accessToken: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  const response = await fetchWithTimeouts(
    fileUrl(fileId, "fields=size,mimeType"),
    { headers: bearer(accessToken) },
    GOOGLE_TIMEOUT_MS,
  );
  if (!response.ok) throw await failWith(response);
  const parsed = fileMetadataSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) throw new GoogleError(502, "invalid_metadata");
  return parsed.data;
}

const isExactRange = (response: Response, start: number, end: number) =>
  response.status === 206 &&
  Number(response.headers.get("Content-Length")) === end - start;

export async function readDriveRange(
  accessToken: string,
  fileId: string,
  start: number,
  end: number,
): Promise<ReadableStream> {
  const response = await fetchWithTimeouts(
    fileUrl(fileId, "alt=media"),
    { headers: { ...bearer(accessToken), Range: `bytes=${start}-${end - 1}` } },
    DRIVE_RANGE_TIMEOUT_MS,
  );
  if (!response.ok || !response.body) throw await failWith(response);
  if (!isExactRange(response, start, end)) {
    throw await failWith(response, 502);
  }
  return response.body;
}
