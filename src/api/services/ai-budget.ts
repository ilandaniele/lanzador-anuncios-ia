import type {
  AiBudgetScope,
  AiFeature,
  AiUsageStatus,
} from "../../shared/constants";
import type { AiCallUsage } from "../../shared/ai-neuron-rates";
import type { Env } from "../env";
import { AppError, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { now, utcPeriods } from "../lib/time";
import {
  findAiBudgetState,
  insertAiUsageWithCounters,
  type AiUsageRow,
} from "../repositories/ai-usage";
import { resolveAiCaps } from "./ai-usage";

type BudgetEnv = Pick<Env, "WORKERS_AI_DAILY_NEURON_CAP">;

export type AiUsageContext = {
  userId?: string | null;
  refId?: string | null;
  status?: AiUsageStatus;
};

async function readBudget(db: D1Database, env: BudgetEnv, workspaceId: string) {
  const periods = utcPeriods(now());
  const state = await findAiBudgetState(db, workspaceId, periods);
  if (!state) throw notFound();
  const { dailyCap, monthlyCap } = resolveAiCaps(state.caps);
  const { workspaceDay, workspaceMonth, globalDay } = state.neurons;
  const left: Record<AiBudgetScope, number> = {
    workspace_day: dailyCap - workspaceDay,
    workspace_month: monthlyCap - workspaceMonth,
    global_day: env.WORKERS_AI_DAILY_NEURON_CAP - globalDay,
  };
  const resetsAt: Record<AiBudgetScope, number> = {
    workspace_day: periods.nextDayAt,
    workspace_month: periods.nextMonthAt,
    global_day: periods.nextDayAt,
  };
  return { left, resetsAt };
}

export async function assertAiBudget(
  db: D1Database,
  env: BudgetEnv,
  workspaceId: string,
) {
  const { left, resetsAt } = await readBudget(db, env, workspaceId);
  const exhausted = (Object.keys(left) as AiBudgetScope[]).find(
    (scope) => left[scope] <= 0,
  );
  if (!exhausted) return;
  throw new AppError(422, "AI_BUDGET_EXHAUSTED", {
    details: {
      scope: exhausted,
      resetsAt: new Date(resetsAt[exhausted]).toISOString(),
    },
  });
}

export async function neuronsLeftToday(
  db: D1Database,
  env: BudgetEnv,
  workspaceId: string,
) {
  const { left } = await readBudget(db, env, workspaceId);
  return Math.max(0, Math.min(...Object.values(left)));
}

export async function recordAiUsage(
  db: D1Database,
  workspaceId: string,
  feature: AiFeature,
  usage: AiCallUsage | readonly AiCallUsage[],
  context: AiUsageContext = {},
) {
  const calls = Array.isArray(usage) ? usage : [usage];
  const at = now();
  const rows = calls.map((call): AiUsageRow => ({
    id: newId(),
    workspaceId,
    userId: context.userId ?? null,
    feature,
    provider: "workers_ai",
    model: call.model,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    neurons: call.neurons,
    status: context.status ?? "ok",
    refId: context.refId ?? null,
    createdAt: at,
  }));
  if (rows.length === 0) return;
  const neurons = calls.reduce((total, call) => total + call.neurons, 0);
  await insertAiUsageWithCounters(db, {
    workspaceId,
    rows,
    neurons,
    periods: utcPeriods(at),
    at,
  });
}
