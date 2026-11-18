import type {
  ListAssetsQuery,
  PatchAssetsRequest,
} from "../../../shared/schemas/meta-connections";
import { decodeStringCursor, paginate } from "../../lib/cursor";
import { notFound, unprocessable } from "../../lib/errors";
import { now } from "../../lib/time";
import {
  applyEnabledChanges,
  selectAssets,
  selectAssetsWithQuota,
} from "../../repositories/meta-assets";
import type { Scope } from "../../repositories/scope";
import { manualAuditEntry } from "../audit-entry";
import { toAssetDto } from "./dto";

type Changes = PatchAssetsRequest["changes"];

export async function listAssets(
  db: D1Database,
  scope: Scope,
  { kind, enabled, cursor, limit }: ListAssetsQuery,
) {
  const page = paginate(
    await selectAssets(db, scope, {
      kind,
      enabled,
      after: cursor ? decodeStringCursor(cursor) : undefined,
      size: limit,
    }),
    limit,
    (row) => row.name,
  );
  return { data: page.rows.map(toAssetDto), nextCursor: page.nextCursor };
}

const idsSetTo = (changes: Changes, enabled: boolean) =>
  changes.filter((change) => change.enabled === enabled).map(({ id }) => id);

function adAccountDelta(
  assets: { id: string; kind: string; enabled: number }[],
  changes: Changes,
) {
  const wanted = new Map(changes.map(({ id, enabled }) => [id, enabled]));
  return assets
    .filter(({ kind }) => kind === "ad_account")
    .reduce(
      (delta, { id, enabled }) =>
        delta + Number(wanted.get(id)) - Number(enabled === 1),
      0,
    );
}

export async function patchAssets(
  db: D1Database,
  scope: Scope,
  requestId: string,
  { changes }: PatchAssetsRequest,
) {
  const { assets, quota } = await selectAssetsWithQuota(
    db,
    scope,
    changes.map(({ id }) => id),
  );
  if (assets.length !== changes.length || !quota) throw notFound();
  if (quota.enabledAdAccounts + adAccountDelta(assets, changes) > quota.max) {
    throw unprocessable("PLAN_AD_ACCOUNT_LIMIT");
  }

  const updated = await applyEnabledChanges(
    db,
    scope,
    {
      enabledIds: idsSetTo(changes, true),
      disabledIds: idsSetTo(changes, false),
    },
    manualAuditEntry(scope, requestId, {
      action: "meta.assets.update",
      objectType: "meta_asset",
      detail: { changes },
    }),
    now(),
  );
  return { data: updated.map(toAssetDto) };
}
