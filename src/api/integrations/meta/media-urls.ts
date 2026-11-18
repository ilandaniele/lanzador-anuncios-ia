import { z } from "zod";
import type { Graph } from "./client";
import { parseThumbnailUrl } from "./thumbnail";
import { parse } from "./upload";

const videoPicturesSchema = z.record(
  z.string(),
  z.object({ picture: z.string().url().optional() }),
);

const imageUrlsSchema = z.object({
  data: z.array(
    z.object({ hash: z.string(), url: z.string().url().optional() }),
  ),
});

const isTrustedThumbnail = (url: string) => {
  try {
    parseThumbnailUrl(url);
    return true;
  } catch {
    return false;
  }
};

const definedUrls = (entries: [string, string | undefined][]) =>
  new Map(
    entries.filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && isTrustedThumbnail(entry[1]),
    ),
  );

export async function readVideoPictures(
  graph: Graph,
  videoIds: readonly string[],
): Promise<Map<string, string>> {
  const reply = await graph.getByIds<unknown>(videoIds, { fields: "picture" });
  return definedUrls(
    Object.entries(parse(videoPicturesSchema, reply)).map(([id, video]) => [
      id,
      video.picture,
    ]),
  );
}

export async function readImageUrls(
  graph: Graph,
  actId: string,
  hashes: readonly string[],
): Promise<Map<string, string>> {
  const reply = await graph.get<unknown>(`${actId}/adimages`, {
    hashes: JSON.stringify(hashes),
    fields: "hash,url",
  });
  return definedUrls(
    parse(imageUrlsSchema, reply).data.map(({ hash, url }) => [hash, url]),
  );
}
