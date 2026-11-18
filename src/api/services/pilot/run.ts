import type { PilotRunTrigger } from "../../../shared/constants";
import type { PilotRunResponse } from "../../../shared/schemas/pilot";
import type { Env } from "../../env";
import { AppError, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import {
  claimPilotRun,
  expireOverdueProposals,
  finishPilotRun,
  findLatestPilotRun,
  insertProposals,
  selectOpenDedupeKeys,
} from "../../repositories/pilot";
import { findPilotRules } from "../../repositories/pilot-rules";
import type { Scope } from "../../repositories/scope";
import { findSettings } from "../../repositories/settings";
import { toPilotProposalDto, toPilotRunDto } from "./dto";
import { explainProposals } from "./explain";
import {
  type DraftEntry,
  toNewProposal,
  toPromptProposal,
} from "./proposal-rows";
import { loadPilotData } from "./rows";
import { evaluateRules } from "./rules-engine";

const RUN_GAP_MS = 5 * 60_000;
const MAX_PROPOSALS_PER_RUN = 50;

async function claimRun(
  env: Env,
  scope: Scope,
  trigger: PilotRunTrigger,
  at: number,
) {
  const id = newId();
  const isManual = trigger === "manual";
  const claimed = await claimPilotRun(env.DB, scope, {
    id,
    trigger,
    triggeredBy: isManual ? scope.userId : null,
    at,
    blockSince: at - RUN_GAP_MS,
    enforceGap: isManual,
  });
  if (claimed) return id;
  const latest = await findLatestPilotRun(env.DB, scope);
  if (latest?.status === "running") throw conflict("RUN_IN_PROGRESS");
  const retryAt = (latest?.startedAt ?? at) + RUN_GAP_MS;
  throw new AppError(429, "RATE_LIMITED", {
    retryAfterSec: Math.max(1, Math.ceil((retryAt - at) / 1000)),
  });
}

async function evaluateDrafts(env: Env, scope: Scope, at: number) {
  await expireOverdueProposals(env.DB, scope, at);
  const [rules, settings, pendingDedupeKeys] = await Promise.all([
    findPilotRules(env.DB, scope),
    findSettings(env.DB, scope),
    selectOpenDedupeKeys(env.DB, scope),
  ]);
  if (!settings) throw notFound();
  const { rows, products } = await loadPilotData(env, scope, rules, at);
  return evaluateRules({
    rules,
    rows,
    products,
    limits: {
      maxScalePercent: settings.maxScalePercent,
      maxCampaignBudgetMinor: settings.maxCampaignBudgetMinor,
    },
    pendingDedupeKeys,
    now: at,
  }).slice(0, MAX_PROPOSALS_PER_RUN);
}

async function createProposals(
  env: Env,
  scope: Scope,
  trigger: PilotRunTrigger,
  runId: string,
  at: number,
) {
  const entries: DraftEntry[] = (await evaluateDrafts(env, scope, at)).map(
    (draft) => ({ id: newId(), draft }),
  );
  const explanations = await explainProposals(
    env,
    scope,
    entries.map(toPromptProposal),
    { runId, userId: trigger === "manual" ? scope.userId : null },
  );
  return insertProposals(
    env.DB,
    entries.map((entry) =>
      toNewProposal(entry, {
        workspaceId: scope.workspaceId,
        runId,
        explanation: explanations.get(entry.id),
        createdAt: at,
      }),
    ),
  );
}

export async function runPilot(
  env: Env,
  scope: Scope,
  trigger: PilotRunTrigger,
): Promise<PilotRunResponse> {
  const at = now();
  const runId = await claimRun(env, scope, trigger, at);
  try {
    const proposals = await createProposals(env, scope, trigger, runId, at);
    const run = await finishPilotRun(env.DB, scope, runId, {
      status: "done",
      proposalsCreated: proposals.length,
      error: null,
      at: now(),
    });
    return {
      run: toPilotRunDto(run!),
      proposals: proposals.map(toPilotProposalDto),
    };
  } catch (error) {
    await finishPilotRun(env.DB, scope, runId, {
      status: "failed",
      proposalsCreated: 0,
      error: error instanceof AppError ? error.code : "INTERNAL",
      at: now(),
    });
    throw error;
  }
}
