import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import type {
  ApprovePilotProposalRequest,
  ApprovePilotProposalResponse,
  DismissPilotProposalRequest,
  DismissPilotProposalResponse,
} from "../../../shared/schemas/pilot";
import type { Env } from "../../env";
import { AppError, conflict, notFound } from "../../lib/errors";
import { now } from "../../lib/time";
import { writeAudit } from "../../repositories/audit";
import {
  decidePendingProposal,
  findProposalForDecision,
  finishExecutingProposal,
  type PilotProposalRow,
  type ProposalForDecision,
} from "../../repositories/pilot";
import type { Scope } from "../../repositories/scope";
import { pilotAuditEntry } from "../audit-entry";
import { createLaunchDraft } from "../launch/drafts";
import { scaleCampaign, setObjectStatus } from "../meta/actions";
import { toPilotProposalDto } from "./dto";
import type { PilotAction, PilotLevel } from "./types";

type ExecutionResult = {
  status: "executed" | "failed";
  resultMessage: string | null;
  launchId: string | null;
};

const proposalAudit = (
  scope: Scope,
  requestId: string,
  proposal: Pick<
    PilotProposalRow,
    | "id"
    | "action"
    | "objectLevel"
    | "objectMetaId"
    | "objectName"
    | "adAccountMetaId"
  >,
  action: string,
  detail: Record<string, unknown> = {},
) =>
  pilotAuditEntry(scope, requestId, {
    action,
    objectType: proposal.objectLevel,
    objectMetaId: proposal.objectMetaId,
    objectName: proposal.objectName,
    adAccountMetaId: proposal.adAccountMetaId,
    detail: {
      proposalId: proposal.id,
      proposalAction: proposal.action,
      ...detail,
    },
  });

function assertApprovable(
  proposal: ProposalForDecision,
  { proposedBudgetMinor }: ApprovePilotProposalRequest,
  at: number,
) {
  if (proposal.status !== "pending" || proposal.expiresAt <= at) {
    throw conflict("PROPOSAL_STALE");
  }
  if (proposal.action !== "scale") return;
  if (proposedBudgetMinor === undefined) {
    throw new AppError(400, "VALIDATION", {
      fields: { proposedBudgetMinor: "invalid_type" },
    });
  }
  if (proposedBudgetMinor !== proposal.proposedBudgetMinor) {
    throw conflict("PROPOSAL_STALE");
  }
}

const cloneDraft = (
  adAccountAssetId: string,
  { objectMetaId, objectName }: ProposalForDecision,
): PartialLaunchDraft => ({
  adAccountAssetId,
  items: [{ source: "clone", cloneAdId: objectMetaId, adName: objectName }],
});

async function execute(
  env: Env,
  scope: Scope,
  proposal: ProposalForDecision,
  requestId: string,
): Promise<string | null> {
  const { adAccountAssetId, objectMetaId } = proposal;
  if (!adAccountAssetId) throw notFound();
  switch (proposal.action as PilotAction) {
    case "pause":
      await setObjectStatus(
        env,
        scope,
        objectMetaId,
        {
          adAccountAssetId,
          level: proposal.objectLevel as PilotLevel,
          status: "PAUSED",
          confirm: true,
        },
        requestId,
        "pilot",
      );
      return null;
    case "scale":
      await scaleCampaign(
        env,
        scope,
        objectMetaId,
        {
          adAccountAssetId,
          percent: proposal.percent!,
          expectedCurrentBudgetMinor: proposal.currentBudgetMinor!,
          confirm: true,
        },
        requestId,
        "pilot",
      );
      return null;
    case "duplicate": {
      const { launch } = await createLaunchDraft(
        env.DB,
        scope,
        cloneDraft(adAccountAssetId, proposal),
        "pilot",
      );
      return launch.id;
    }
  }
}

const finish = (
  db: D1Database,
  scope: Scope,
  proposal: ProposalForDecision,
  requestId: string,
  result: ExecutionResult,
) =>
  finishExecutingProposal(db, scope, proposal.id, result, {
    ...proposalAudit(
      scope,
      requestId,
      proposal,
      "pilot.proposal.approve",
      result.resultMessage ? { error: result.resultMessage } : {},
    ),
    launchId: result.launchId ?? undefined,
    result: result.status === "executed" ? "ok" : "error",
  });

async function executeOrFail(
  env: Env,
  scope: Scope,
  proposal: ProposalForDecision,
  requestId: string,
) {
  try {
    return await execute(env, scope, proposal, requestId);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL";
    await finish(env.DB, scope, proposal, requestId, {
      status: "failed",
      resultMessage: code,
      launchId: null,
    });
    throw code === "BUDGET_CHANGED" ? conflict("PROPOSAL_STALE") : error;
  }
}

export async function approveProposal(
  env: Env,
  scope: Scope,
  id: string,
  input: ApprovePilotProposalRequest,
  requestId: string,
): Promise<ApprovePilotProposalResponse> {
  const at = now();
  const proposal = await findProposalForDecision(env.DB, scope, id);
  if (!proposal) throw notFound();
  assertApprovable(proposal, input, at);
  const claimed = await decidePendingProposal(env.DB, scope, id, {
    status: "executing",
    resultMessage: null,
    at,
  });
  if (!claimed) throw conflict("PROPOSAL_STALE");
  const launchId = await executeOrFail(env, scope, proposal, requestId);
  const row = await finish(env.DB, scope, proposal, requestId, {
    status: "executed",
    resultMessage: null,
    launchId,
  });
  return {
    proposal: toPilotProposalDto(row!),
    ...(launchId ? { launchId } : {}),
  };
}

export async function dismissProposal(
  db: D1Database,
  scope: Scope,
  id: string,
  { reason }: DismissPilotProposalRequest,
  requestId: string,
): Promise<DismissPilotProposalResponse> {
  const row = await decidePendingProposal(db, scope, id, {
    status: "dismissed",
    resultMessage: reason ?? null,
    at: now(),
  });
  if (!row) {
    if (!(await findProposalForDecision(db, scope, id))) throw notFound();
    throw conflict("PROPOSAL_STALE");
  }
  await writeAudit(
    db,
    proposalAudit(scope, requestId, row, "pilot.proposal.dismiss", {
      reason: reason ?? null,
    }),
  );
  return { proposal: toPilotProposalDto(row) };
}
