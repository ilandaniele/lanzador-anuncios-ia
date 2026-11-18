import type { Graph } from "../../integrations/meta/client";
import {
  discoverAssets,
  type GranularScope,
} from "../../integrations/meta/read";
import { syncDiscoveredAssets } from "../../repositories/meta-assets";
import type { Scope } from "../../repositories/scope";
import { now } from "../../lib/time";

export async function discoverConnectionAssets(
  db: D1Database,
  scope: Scope,
  graph: Graph,
  connectionId: string,
  granularScopes?: GranularScope[],
) {
  const { assets, businessId, businessName } = await discoverAssets(
    graph,
    granularScopes,
  );
  await syncDiscoveredAssets(db, scope, connectionId, assets, now());
  return { businessId, businessName, assetCount: assets.length };
}
