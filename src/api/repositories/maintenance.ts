import {
  and,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { magicLinks, sessions } from "../../db/schema/auth";
import { creatives, uploads } from "../../db/schema/creatives";
import { errorEvents } from "../../db/schema/ops";
import { metaConnections } from "../../db/schema/meta";
import { insightsCache, pilotRules } from "../../db/schema/pilot";
import { oauthStates, workspaces } from "../../db/schema/workspaces";
import { billingAllowed } from "./billing-access";
import { expireAllOverdueProposals } from "./pilot";

export interface CleanupCutoffs {
  at: number;
  insightsExpiredBefore: number;
  errorEventsBefore: number;
  aiQueuedBefore: number;
  importingBefore: number;
}

export async function runCleanupBatch(
  db: D1Database,
  {
    at,
    insightsExpiredBefore,
    errorEventsBefore,
    aiQueuedBefore,
    importingBefore,
  }: CleanupCutoffs,
): Promise<void> {
  const orm = drizzle(db);
  const overdueUploads = and(
    eq(uploads.status, "uploading"),
    lte(uploads.expiresAt, at),
  );
  await orm.batch([
    orm.delete(magicLinks).where(lte(magicLinks.expiresAt, at)),
    orm.delete(oauthStates).where(lte(oauthStates.expiresAt, at)),
    orm.delete(sessions).where(lte(sessions.expiresAt, at)),
    orm
      .update(creatives)
      .set({ status: "failed", error: "UPLOAD_EXPIRED", updatedAt: at })
      .where(
        and(
          eq(creatives.status, "uploading"),
          inArray(
            creatives.id,
            orm
              .select({ id: uploads.creativeId })
              .from(uploads)
              .where(overdueUploads),
          ),
        ),
      ),
    orm.update(uploads).set({ status: "expired" }).where(overdueUploads),
    orm
      .update(creatives)
      .set({ aiStatus: "pending", updatedAt: at })
      .where(
        and(
          eq(creatives.aiStatus, "queued"),
          lt(creatives.updatedAt, aiQueuedBefore),
        ),
      ),
    orm
      .update(creatives)
      .set({ status: "failed", error: "IMPORT_EXPIRED", updatedAt: at })
      .where(
        and(
          eq(creatives.status, "importing"),
          lt(creatives.updatedAt, importingBefore),
        ),
      ),
    orm
      .delete(insightsCache)
      .where(
        and(
          lte(insightsCache.expiresAt, insightsExpiredBefore),
          or(
            isNull(insightsCache.refreshingUntil),
            lte(insightsCache.refreshingUntil, at),
          ),
        ),
      ),
    orm.delete(errorEvents).where(lt(errorEvents.createdAt, errorEventsBefore)),
    expireAllOverdueProposals(db, at),
  ]);
}

export async function selectRecentlyActiveWorkspaceIds(
  db: D1Database,
  { at, activeSince }: { at: number; activeSince: number },
  limit: number,
): Promise<string[]> {
  const rows = await drizzle(db)
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.status, "active"),
        gt(workspaces.lastActivityAt, activeSince),
        billingAllowed(at),
      ),
    )
    .orderBy(desc(workspaces.lastActivityAt))
    .limit(limit);
  return rows.map(({ id }) => id);
}

export async function selectPilotEligibleWorkspaceIds(
  db: D1Database,
  at: number,
  limit: number,
): Promise<string[]> {
  const orm = drizzle(db);
  const rows = await orm
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.status, "active"),
        billingAllowed(at),
        exists(
          orm
            .select({ id: metaConnections.id })
            .from(metaConnections)
            .where(
              and(
                eq(metaConnections.workspaceId, workspaces.id),
                eq(metaConnections.status, "active"),
              ),
            ),
        ),
        exists(
          orm
            .select({ id: pilotRules.id })
            .from(pilotRules)
            .where(
              and(
                eq(pilotRules.workspaceId, workspaces.id),
                eq(pilotRules.enabled, 1),
              ),
            ),
        ),
      ),
    )
    .orderBy(workspaces.id)
    .limit(limit);
  return rows.map(({ id }) => id);
}
