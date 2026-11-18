import {
  and,
  desc,
  eq,
  gt,
  inArray,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { metaAssets } from "../../db/schema/meta";
import { products } from "../../db/schema/products";
import { pilotProposals, pilotRuns } from "../../db/schema/pilot";
import type { PilotRunTrigger, ProposalStatus } from "../../shared/constants";
import { type AuditEntry, auditStatement } from "./audit";
import { inWorkspace, type Scope } from "./scope";

const PROPOSALS_PER_STATEMENT = 5;
const OPEN_STATUSES = ["pending", "executing"] as const;

const runColumns = {
  id: pilotRuns.id,
  trigger: pilotRuns.trigger,
  status: pilotRuns.status,
  proposalsCreated: pilotRuns.proposalsCreated,
  startedAt: pilotRuns.startedAt,
  finishedAt: pilotRuns.finishedAt,
};

const proposalColumns = {
  id: pilotProposals.id,
  runId: pilotProposals.runId,
  ruleType: pilotProposals.ruleType,
  action: pilotProposals.action,
  adAccountMetaId: pilotProposals.adAccountMetaId,
  objectLevel: pilotProposals.objectLevel,
  objectMetaId: pilotProposals.objectMetaId,
  objectName: pilotProposals.objectName,
  evidence: pilotProposals.evidence,
  currentBudgetMinor: pilotProposals.currentBudgetMinor,
  proposedBudgetMinor: pilotProposals.proposedBudgetMinor,
  percent: pilotProposals.percent,
  explanation: pilotProposals.explanation,
  status: pilotProposals.status,
  resultMessage: pilotProposals.resultMessage,
  launchId: pilotProposals.launchId,
  decidedAt: pilotProposals.decidedAt,
  expiresAt: pilotProposals.expiresAt,
  createdAt: pilotProposals.createdAt,
};

export type PilotRunRow = Awaited<ReturnType<typeof selectPilotRuns>>[number];
export type PilotProposalRow = Awaited<
  ReturnType<typeof selectPilotProposals>
>[number];
export type NewPilotProposal = typeof pilotProposals.$inferInsert;

export interface PilotRunClaim {
  id: string;
  trigger: PilotRunTrigger;
  triggeredBy: string | null;
  at: number;
  blockSince: number;
  enforceGap: boolean;
}

export async function claimPilotRun(
  db: D1Database,
  scope: Scope,
  claim: PilotRunClaim,
): Promise<boolean> {
  const inserted = await drizzle(db).get<{ id: string }>(
    sql`INSERT INTO ${pilotRuns}
        (id, workspace_id, trigger, triggered_by, status, proposals_created, started_at)
      SELECT ${claim.id}, ${scope.workspaceId}, ${claim.trigger}, ${claim.triggeredBy},
        'running', 0, ${claim.at}
      WHERE NOT EXISTS (SELECT 1 FROM ${pilotRuns}
        WHERE ${pilotRuns.workspaceId} = ${scope.workspaceId}
          AND ${pilotRuns.startedAt} > ${claim.blockSince}
          AND (${pilotRuns.status} = 'running' OR ${Number(claim.enforceGap)} = 1))
      RETURNING id`,
  );
  return inserted !== undefined;
}

export async function findLatestPilotRun(db: D1Database, scope: Scope) {
  const [row] = await drizzle(db)
    .select({ status: pilotRuns.status, startedAt: pilotRuns.startedAt })
    .from(pilotRuns)
    .where(inWorkspace(pilotRuns, scope))
    .orderBy(desc(pilotRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function finishPilotRun(
  db: D1Database,
  scope: Scope,
  id: string,
  result: {
    status: "done" | "failed";
    proposalsCreated: number;
    error: string | null;
    at: number;
  },
) {
  const [row] = await drizzle(db)
    .update(pilotRuns)
    .set({
      status: result.status,
      proposalsCreated: result.proposalsCreated,
      error: result.error,
      finishedAt: result.at,
    })
    .where(and(inWorkspace(pilotRuns, scope), eq(pilotRuns.id, id)))
    .returning(runColumns);
  return row;
}

const expireOverdue = (db: D1Database, at: number, only?: SQL) =>
  drizzle(db)
    .update(pilotProposals)
    .set({ status: "expired" })
    .where(
      and(
        only,
        eq(pilotProposals.status, "pending"),
        lte(pilotProposals.expiresAt, at),
      ),
    );

export const expireOverdueProposals = (
  db: D1Database,
  scope: Scope,
  at: number,
) => expireOverdue(db, at, inWorkspace(pilotProposals, scope));

export const expireAllOverdueProposals = (db: D1Database, at: number) =>
  expireOverdue(db, at);

export async function selectOpenDedupeKeys(db: D1Database, scope: Scope) {
  const rows = await drizzle(db)
    .select({ dedupeKey: pilotProposals.dedupeKey })
    .from(pilotProposals)
    .where(
      and(
        inWorkspace(pilotProposals, scope),
        inArray(pilotProposals.status, OPEN_STATUSES),
      ),
    );
  return new Set(rows.map(({ dedupeKey }) => dedupeKey));
}

export const selectProductEconomics = (
  db: D1Database,
  scope: Scope,
  productIds: string[],
) =>
  drizzle(db)
    .select({
      id: products.id,
      priceMinor: products.priceMinor,
      costMinor: products.costMinor,
    })
    .from(products)
    .where(
      and(
        inWorkspace(products, scope),
        sql`${products.id} in (select value from json_each(${JSON.stringify(productIds)}))`,
      ),
    );

export async function insertProposals(
  db: D1Database,
  rows: NewPilotProposal[],
): Promise<PilotProposalRow[]> {
  if (rows.length === 0) return [];
  const orm = drizzle(db);
  const statements = Array.from(
    { length: Math.ceil(rows.length / PROPOSALS_PER_STATEMENT) },
    (_, index) =>
      orm
        .insert(pilotProposals)
        .values(
          rows.slice(
            index * PROPOSALS_PER_STATEMENT,
            (index + 1) * PROPOSALS_PER_STATEMENT,
          ),
        )
        .onConflictDoNothing()
        .returning(proposalColumns),
  );
  const [first, ...rest] = statements;
  const results = await orm.batch([first!, ...rest]);
  return results.flat();
}

export const selectPilotRuns = (
  db: D1Database,
  scope: Scope,
  page: { after?: { id: string; sortValue: number }; size: number },
) =>
  drizzle(db)
    .select(runColumns)
    .from(pilotRuns)
    .where(
      and(
        inWorkspace(pilotRuns, scope),
        page.after
          ? or(
              lt(pilotRuns.startedAt, page.after.sortValue),
              and(
                eq(pilotRuns.startedAt, page.after.sortValue),
                lt(pilotRuns.id, page.after.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(pilotRuns.startedAt), desc(pilotRuns.id))
    .limit(page.size + 1);

export const selectPilotProposals = (
  db: D1Database,
  scope: Scope,
  page: {
    status: ProposalStatus;
    after?: { id: string; sortValue: number };
    size: number;
  },
) =>
  drizzle(db)
    .select(proposalColumns)
    .from(pilotProposals)
    .where(
      and(
        inWorkspace(pilotProposals, scope),
        eq(pilotProposals.status, page.status),
        page.after
          ? or(
              lt(pilotProposals.createdAt, page.after.sortValue),
              and(
                eq(pilotProposals.createdAt, page.after.sortValue),
                lt(pilotProposals.id, page.after.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(pilotProposals.createdAt), desc(pilotProposals.id))
    .limit(page.size + 1);

const proposalById = (scope: Scope, id: string) =>
  and(inWorkspace(pilotProposals, scope), eq(pilotProposals.id, id));

export async function findProposalForDecision(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  const [row] = await drizzle(db)
    .select({ ...proposalColumns, adAccountAssetId: metaAssets.id })
    .from(pilotProposals)
    .leftJoin(
      metaAssets,
      and(
        eq(metaAssets.workspaceId, pilotProposals.workspaceId),
        eq(metaAssets.kind, "ad_account"),
        eq(metaAssets.metaId, pilotProposals.adAccountMetaId),
      ),
    )
    .where(proposalById(scope, id))
    .limit(1);
  return row ?? null;
}

export type ProposalForDecision = NonNullable<
  Awaited<ReturnType<typeof findProposalForDecision>>
>;

export async function decidePendingProposal(
  db: D1Database,
  scope: Scope,
  id: string,
  decision: {
    status: "executing" | "dismissed";
    resultMessage: string | null;
    at: number;
  },
) {
  const [row] = await drizzle(db)
    .update(pilotProposals)
    .set({
      status: decision.status,
      resultMessage: decision.resultMessage,
      decidedBy: scope.userId,
      decidedAt: decision.at,
    })
    .where(
      and(
        proposalById(scope, id),
        eq(pilotProposals.status, "pending"),
        gt(pilotProposals.expiresAt, decision.at),
      ),
    )
    .returning(proposalColumns);
  return row ?? null;
}

export async function finishExecutingProposal(
  db: D1Database,
  scope: Scope,
  id: string,
  result: {
    status: "executed" | "failed";
    resultMessage: string | null;
    launchId: string | null;
  },
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  const [[row]] = await orm.batch([
    orm
      .update(pilotProposals)
      .set(result)
      .where(
        and(proposalById(scope, id), eq(pilotProposals.status, "executing")),
      )
      .returning(proposalColumns),
    auditStatement(db, audit),
  ]);
  return row;
}
