const FOLDER_PATH = /\/folders\/([A-Za-z0-9_-]{10,128})/;
const FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;

export function parseDriveFolderId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;
  const fromPath = FOLDER_PATH.exec(url.pathname)?.[1];
  if (fromPath) return fromPath;
  const fromQuery = url.searchParams.get("id");
  return fromQuery && FILE_ID.test(fromQuery) ? fromQuery : null;
}
