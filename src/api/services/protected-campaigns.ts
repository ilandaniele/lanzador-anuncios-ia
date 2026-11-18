import type { PaginationQuery } from "../../shared/schemas/common";
import type {
  ProtectCampaignRequest,
  ProtectedCampaignDto,
} from "../../shared/schemas/meta-actions";
import type { Env } from "../env";
import { getMetaObject } from "../integrations/meta/objects";
import { decodeCursor, paginate } from "../lib/cursor";
import { notFound } from "../lib/errors";
import { now } from "../lib/time";
import {
  deleteProtectedCampaign,
  findProtectedCampaign,
  insertProtectedCampaign,
  type ProtectedCampaignRow,
  selectProtectedCampaigns,
} from "../repositories/protected-campaigns";
import type { Scope } from "../repositories/scope";
import { manualAuditEntry } from "./audit-entry";
import { assertAssetAccount, getGraphForAsset } from "./meta/connection";
import { rethrowMetaError } from "./meta/meta-error";

const toProtectedCampaignDto = (
  row: ProtectedCampaignRow,
): ProtectedCampaignDto => ({
  campaignId: row.campaignMetaId,
  adAccountId: row.adAccountMetaId,
  protectedBy: row.protectedBy,
  createdAt: new Date(row.createdAt).toISOString(),
});

export async function listProtectedCampaigns(
  db: D1Database,
  scope: Scope,
  { cursor, limit }: PaginationQuery,
) {
  const after = cursor ? decodeCursor(cursor).id : undefined;
  const rows = await selectProtectedCampaigns(db, scope, {
    after,
    size: limit,
  });
  const page = paginate(
    rows.map((row) => ({ ...row, id: row.campaignMetaId })),
    limit,
  );
  return {
    data: page.rows.map(toProtectedCampaignDto),
    nextCursor: page.nextCursor,
  };
}

export async function protectCampaign(
  env: Env,
  scope: Scope,
  campaignId: string,
  { adAccountAssetId }: ProtectCampaignRequest,
  requestId: string,
) {
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    adAccountAssetId,
  );
  const campaign = await getMetaObject(graph, campaignId).catch(
    rethrowMetaError,
  );
  assertAssetAccount(asset, campaign.accountId);
  if (await findProtectedCampaign(env.DB, scope, campaignId)) return;

  const audit = {
    ...manualAuditEntry(scope, requestId, {
      action: "campaign.protect",
      objectType: "campaign",
      objectName: campaign.name,
      detail: { before: { protected: false }, after: { protected: true } },
    }),
    objectMetaId: campaignId,
    adAccountMetaId: asset.metaId,
  };
  await insertProtectedCampaign(
    env.DB,
    scope,
    {
      campaignMetaId: campaignId,
      adAccountMetaId: asset.metaId,
      createdAt: now(),
    },
    audit,
  );
}

export async function unprotectCampaign(
  db: D1Database,
  scope: Scope,
  campaignId: string,
  requestId: string,
) {
  const row = await findProtectedCampaign(db, scope, campaignId);
  if (!row) throw notFound();
  const audit = {
    ...manualAuditEntry(scope, requestId, {
      action: "campaign.unprotect",
      objectType: "campaign",
      detail: { before: { protected: true }, after: { protected: false } },
    }),
    objectMetaId: campaignId,
    adAccountMetaId: row.adAccountMetaId,
  };
  await deleteProtectedCampaign(db, scope, campaignId, audit);
}
