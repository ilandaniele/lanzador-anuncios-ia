import {
  type ObjectStatusRequest,
  type ObjectStatusResponse,
  type ScaleCampaignRequest,
  type ScaleCampaignResponse,
  WRITABLE_STATUSES,
} from "../../../shared/schemas/meta-actions";
import type { Env } from "../../env";
import { MetaError } from "../../integrations/meta/client";
import {
  getCampaignBudget,
  getMetaObject,
} from "../../integrations/meta/objects";
import {
  setDailyBudget,
  setStatus,
  type WritableStatus,
} from "../../integrations/meta/write";
import { conflict, unprocessable } from "../../lib/errors";
import { type AuditEntry, writeAudit } from "../../repositories/audit";
import type { Scope } from "../../repositories/scope";
import { manualAuditEntry } from "../audit-entry";
import { scaledBudget } from "../scale-budget";
import { getSettings } from "../settings";
import { assertAssetAccount, getGraphForAsset } from "./connection";
import { rethrowMetaError } from "./meta-error";

const isWritableStatus = (status: string): status is WritableStatus =>
  (WRITABLE_STATUSES as readonly string[]).includes(status);

function failedAudit(audit: AuditEntry, error: MetaError): AuditEntry {
  return {
    ...audit,
    result: "error",
    detail: {
      ...audit.detail,
      error: { code: error.code, message: error.message },
    },
  };
}

async function auditedWrite(
  db: D1Database,
  audit: AuditEntry,
  write: () => Promise<void>,
) {
  try {
    await write();
  } catch (error) {
    if (error instanceof MetaError) {
      await writeAudit(db, failedAudit(audit, error));
    }
    rethrowMetaError(error);
  }
  await writeAudit(db, audit);
}

export async function setObjectStatus(
  env: Env,
  scope: Scope,
  objectId: string,
  { adAccountAssetId, level, status }: ObjectStatusRequest,
  requestId: string,
): Promise<ObjectStatusResponse> {
  if (!isWritableStatus(status)) throw unprocessable("INVALID_STATUS");
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    adAccountAssetId,
  );
  const object = await getMetaObject(graph, objectId).catch(rethrowMetaError);
  assertAssetAccount(asset, object.accountId);
  if (!isWritableStatus(object.status)) throw unprocessable("INVALID_STATUS");
  if (object.status === status) return { status };

  const audit = {
    ...manualAuditEntry(scope, requestId, {
      action: "meta.status.update",
      objectType: level,
      objectName: object.name,
      detail: { before: { status: object.status }, after: { status } },
    }),
    objectMetaId: objectId,
    adAccountMetaId: asset.metaId,
  };
  await auditedWrite(env.DB, audit, () => setStatus(graph, objectId, status));
  return { status };
}

export async function scaleCampaign(
  env: Env,
  scope: Scope,
  campaignId: string,
  {
    adAccountAssetId,
    percent,
    expectedCurrentBudgetMinor,
  }: ScaleCampaignRequest,
  requestId: string,
): Promise<ScaleCampaignResponse> {
  const { graph, asset } = await getGraphForAsset(
    env.DB,
    env,
    scope,
    adAccountAssetId,
  );
  const [settings, campaign] = await Promise.all([
    getSettings(env.DB, scope),
    getCampaignBudget(graph, campaignId).catch(rethrowMetaError),
  ]);
  assertAssetAccount(asset, campaign.accountId);
  const previousBudgetMinor = campaign.dailyBudgetMinor;
  if (previousBudgetMinor === null) throw unprocessable("NOT_CBO");
  if (previousBudgetMinor !== expectedCurrentBudgetMinor) {
    throw conflict("BUDGET_CHANGED");
  }
  const newBudgetMinor = scaledBudget(previousBudgetMinor, percent, settings);

  const audit = {
    ...manualAuditEntry(scope, requestId, {
      action: "meta.budget.scale",
      objectType: "campaign",
      objectName: campaign.name,
      detail: {
        percent,
        before: { dailyBudgetMinor: previousBudgetMinor },
        after: { dailyBudgetMinor: newBudgetMinor },
      },
    }),
    objectMetaId: campaignId,
    adAccountMetaId: asset.metaId,
  };
  await auditedWrite(env.DB, audit, () =>
    setDailyBudget(graph, campaignId, newBudgetMinor),
  );
  return { previousBudgetMinor, newBudgetMinor };
}
