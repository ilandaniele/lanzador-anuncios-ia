import type {
  LaunchCheck,
  LaunchDto,
  LaunchItemDto,
  LaunchListItemDto,
  LaunchPlan,
  PartialLaunchDraft,
} from "../../../shared/schemas/launch";
import { toIsoOrNull } from "../../lib/time";
import type {
  LaunchItemRow,
  LaunchListRow,
  LaunchRow,
} from "../../repositories/launches";
import { metaCampaignUrl } from "./campaign-url";

const parseJsonOrNull = <T>(value: string | null) =>
  value === null ? null : (JSON.parse(value) as T);

const toIso = (at: number) => new Date(at).toISOString();

export const toLaunchListItem = (row: LaunchListRow): LaunchListItemDto => ({
  id: row.id,
  status: row.status,
  source: row.source,
  productName: row.productName,
  adAccountName: row.adAccountName,
  campaignName: row.campaignName,
  itemsTotal: row.itemsTotal,
  itemsDone: row.itemsDone,
  itemsFailed: row.itemsFailed,
  metaCampaignUrl: metaCampaignUrl(row.adAccountMetaId, row.metaCampaignId),
  createdBy: row.createdBy,
  createdAt: toIso(row.createdAt),
});

export const toLaunchDto = (row: LaunchRow): LaunchDto => ({
  id: row.id,
  status: row.status,
  phase: row.phase,
  source: row.source,
  mode: row.mode,
  adAccountAssetId: row.adAccountAssetId,
  currency: row.currency,
  productId: row.productId,
  draft: JSON.parse(row.draft) as PartialLaunchDraft,
  planHash: row.planHash,
  dailyBudgetMinor: row.dailyBudgetMinor,
  startAt: toIsoOrNull(row.startAt),
  metaCampaignUrl: metaCampaignUrl(row.adAccountMetaId, row.metaCampaignId),
  itemsTotal: row.itemsTotal,
  itemsDone: row.itemsDone,
  itemsFailed: row.itemsFailed,
  checksOk: row.checksOk === null ? null : row.checksOk === 1,
  errorCode: row.errorCode,
  errorMessage: row.errorMessage,
  createdBy: row.createdBy,
  createdAt: toIso(row.createdAt),
  startedAt: toIsoOrNull(row.startedAt),
  finishedAt: toIsoOrNull(row.finishedAt),
  activatedAt: toIsoOrNull(row.activatedAt),
  updatedAt: toIso(row.updatedAt),
});

const toLaunchItemDto = (row: LaunchItemRow): LaunchItemDto => ({
  id: row.id,
  position: row.position,
  status: row.status,
  source: row.source,
  creativeId: row.creativeId,
  adName: row.adName,
  metaAdId: row.metaAdId,
  errorCode: row.errorCode,
  errorMessage: row.errorMessage,
});

export const toLaunchDetail = (launch: LaunchRow, items: LaunchItemRow[]) => ({
  launch: toLaunchDto(launch),
  items: items.map(toLaunchItemDto),
  checks: parseJsonOrNull<LaunchCheck[]>(launch.checks),
  plan: parseJsonOrNull<LaunchPlan>(launch.plan),
});
