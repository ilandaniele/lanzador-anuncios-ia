import type {
  AssetDto,
  ConnectionDto,
} from "../../../shared/schemas/meta-connections";
import { toIsoOrNull } from "../../lib/time";
import type { AssetRow } from "../../repositories/meta-assets";
import type { ConnectionRow } from "../../repositories/meta-connections";

const parseScopes = (raw: string): string[] => {
  const scopes: unknown = JSON.parse(raw);
  return Array.isArray(scopes)
    ? scopes.filter((scope) => typeof scope === "string")
    : [];
};

export const toConnectionDto = (row: ConnectionRow): ConnectionDto => ({
  id: row.id,
  businessId: row.metaBusinessId,
  businessName: row.businessName,
  status: row.status,
  scopes: parseScopes(row.scopes),
  connectedBy: row.connectedBy,
  connectedAt: new Date(row.createdAt).toISOString(),
  lastErrorCode: row.lastErrorCode,
  tokenExpiresAt: toIsoOrNull(row.tokenExpiresAt),
  creativeCount: row.creativeCount,
});

export const toAssetDto = (row: AssetRow): AssetDto => ({
  id: row.id,
  kind: row.kind,
  metaId: row.metaId,
  name: row.name,
  parentMetaId: row.parentMetaId,
  currency: row.currency,
  enabled: row.enabled === 1,
  health: {
    accountStatus: row.accountStatus,
    disableReason: row.disableReason,
    fundingOk: row.fundingOk === null ? null : row.fundingOk === 1,
    spendCapPct: row.spendCapPct,
    checkedAt: toIsoOrNull(row.healthCheckedAt),
  },
});
