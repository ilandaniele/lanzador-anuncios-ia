import type { Env } from "../../env";
import {
  readImageUrls,
  readVideoPictures,
} from "../../integrations/meta/media-urls";
import { chunk } from "../../lib/chunk";
import { groupBy } from "../../lib/group-by";
import { fulfilledValues, throwFirstRejection } from "../../lib/settled";
import { HOUR_MS } from "../../lib/time";
import {
  type RefreshedThumbnail,
  saveThumbnails,
  selectStaleThumbnails,
  type StaleThumbnail,
} from "../../repositories/thumbnails";
import { decryptConnectionToken, graphForConnection } from "../meta/connection";

const REFRESH_AFTER_MS = 20 * HOUR_MS;
const CREATIVES_PER_RUN = 200;
const IDS_PER_CALL = 50;

type RefreshEnv = Pick<
  Env,
  "DB" | "GRAPH_API_VERSION" | "META_APP_SECRET" | "TOKEN_ENC_KEY_CURRENT"
>;
type Graph = ReturnType<typeof graphForConnection>;
type UrlReader = (keys: string[]) => Promise<Map<string, string>>;
type BatchResult = PromiseSettledResult<RefreshedThumbnail[]>;

function refreshByKey(
  items: StaleThumbnail[],
  keyOf: (item: StaleThumbnail) => string | null,
  read: UrlReader,
): Promise<BatchResult[]> {
  const keyed = items.flatMap((item) => {
    const key = keyOf(item);
    return key ? [{ id: item.id, key }] : [];
  });
  return Promise.allSettled(
    chunk(keyed, IDS_PER_CALL).map(async (batch) => {
      const urls = await read(batch.map(({ key }) => key));
      return batch.flatMap(({ id, key }) => {
        const thumbnailUrl = urls.get(key);
        return thumbnailUrl ? [{ id, thumbnailUrl }] : [];
      });
    }),
  );
}

const refreshVideos = (graph: Graph, items: StaleThumbnail[]) =>
  refreshByKey(
    items,
    ({ metaVideoId }) => metaVideoId,
    (ids) => readVideoPictures(graph, ids),
  );

async function refreshImages(graph: Graph, items: StaleThumbnail[]) {
  const images = items.filter(({ metaVideoId }) => !metaVideoId);
  const byAccount = groupBy(images, ({ accountMetaId }) => accountMetaId);
  const groups = await Promise.all(
    [...byAccount].map(([actId, accountImages]) =>
      refreshByKey(
        accountImages,
        ({ metaImageHash }) => metaImageHash,
        (hashes) => readImageUrls(graph, actId, hashes),
      ),
    ),
  );
  return groups.flat();
}

async function refreshConnection(
  env: RefreshEnv,
  items: StaleThumbnail[],
): Promise<BatchResult[]> {
  const { connection } = items[0]!;
  const token = await decryptConnectionToken(
    env,
    connection.workspaceId,
    connection,
  );
  const graph = graphForConnection(env.DB, env, {
    token,
    connectionId: connection.id,
    workspaceId: connection.workspaceId,
  });
  const [videos, images] = await Promise.all([
    refreshVideos(graph, items),
    refreshImages(graph, items),
  ]);
  return [...videos, ...images];
}

export async function refreshStaleThumbnails(
  env: RefreshEnv,
  at: number,
): Promise<void> {
  const stale = await selectStaleThumbnails(
    env.DB,
    { at, refreshedBefore: at - REFRESH_AFTER_MS },
    CREATIVES_PER_RUN,
  );
  const byConnection = groupBy(stale, ({ connection }) => connection.id);
  const connections = await Promise.allSettled(
    [...byConnection.values()].map((items) => refreshConnection(env, items)),
  );
  const batches = fulfilledValues(connections).flat();
  await saveThumbnails(env.DB, stale, fulfilledValues(batches).flat(), at);
  throwFirstRejection([...connections, ...batches]);
}
