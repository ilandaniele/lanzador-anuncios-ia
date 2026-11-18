import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { protectedCampaigns } from "../../db/schema/pilot";
import { auditStatement, type AuditEntry } from "./audit";
import { inWorkspace, type Scope } from "./scope";

export type ProtectedCampaignRow = {
  campaignMetaId: string;
  adAccountMetaId: string;
  protectedBy: string | null;
  createdAt: number;
};

const protectedCampaignColumns = {
  campaignMetaId: protectedCampaigns.campaignMetaId,
  adAccountMetaId: protectedCampaigns.adAccountMetaId,
  protectedBy: protectedCampaigns.protectedBy,
  createdAt: protectedCampaigns.createdAt,
};

const isCampaign = (scope: Scope, campaignMetaId: string) =>
  and(
    inWorkspace(protectedCampaigns, scope),
    eq(protectedCampaigns.campaignMetaId, campaignMetaId),
  );

export const selectProtectedCampaigns = (
  db: D1Database,
  scope: Scope,
  page: { after?: string; size: number },
): Promise<ProtectedCampaignRow[]> =>
  drizzle(db)
    .select(protectedCampaignColumns)
    .from(protectedCampaigns)
    .where(
      and(
        inWorkspace(protectedCampaigns, scope),
        page.after
          ? gt(protectedCampaigns.campaignMetaId, page.after)
          : undefined,
      ),
    )
    .orderBy(protectedCampaigns.campaignMetaId)
    .limit(page.size + 1);

export async function findProtectedCampaign(
  db: D1Database,
  scope: Scope,
  campaignMetaId: string,
): Promise<ProtectedCampaignRow | null> {
  const [row] = await drizzle(db)
    .select(protectedCampaignColumns)
    .from(protectedCampaigns)
    .where(isCampaign(scope, campaignMetaId))
    .limit(1);
  return row ?? null;
}

export async function insertProtectedCampaign(
  db: D1Database,
  scope: Scope,
  row: { campaignMetaId: string; adAccountMetaId: string; createdAt: number },
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .insert(protectedCampaigns)
      .values({
        ...row,
        workspaceId: scope.workspaceId,
        protectedBy: scope.userId,
      })
      .onConflictDoNothing(),
    auditStatement(db, audit),
  ]);
}

export async function deleteProtectedCampaign(
  db: D1Database,
  scope: Scope,
  campaignMetaId: string,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm.delete(protectedCampaigns).where(isCampaign(scope, campaignMetaId)),
    auditStatement(db, audit),
  ]);
}
