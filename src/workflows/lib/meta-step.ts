import type { WorkflowStep } from "cloudflare:workers";
import {
  MetaError,
  type MetaErrorInit,
  type MetaErrorKind,
} from "../../api/integrations/meta/errors";
import type { SubrequestBudget } from "./subrequest-budget";

const MINUTE_MS = 60_000;
export const RATE_LIMIT_DELAYS_MS = [1, 2, 4, 8, 15, 15].map(
  (minutes) => minutes * MINUTE_MS,
);
export const TRANSIENT_DELAYS_MS = [10_000, 30_000, 90_000];

const RETRY_DELAYS_MS: Partial<Record<MetaErrorKind, number[]>> = {
  rate_limit: RATE_LIMIT_DELAYS_MS,
  transient: TRANSIENT_DELAYS_MS,
};

export type MetaStepRunner = Pick<WorkflowStep, "do" | "sleep">;

export interface MetaStepOptions {
  budget?: SubrequestBudget;
  subrequests?: number;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: MetaErrorInit };

const toInit = (error: MetaError): MetaErrorInit => ({
  kind: error.kind,
  code: error.code,
  subcode: error.subcode,
  userTitle: error.userTitle,
  userMsg: error.userMsg,
  retryAfterMs: error.retryAfterMs,
  message: error.message,
});

async function attemptRun<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof MetaError) return { ok: false, error: toInit(error) };
    throw error;
  }
}

function nextDelay(
  error: MetaErrorInit,
  retries: Partial<Record<MetaErrorKind, number>>,
): number | undefined {
  const done = retries[error.kind] ?? 0;
  const delay = RETRY_DELAYS_MS[error.kind]?.[done];
  if (delay === undefined) return undefined;
  retries[error.kind] = done + 1;
  return error.retryAfterMs ?? delay;
}

const attemptName = (name: string, attempt: number) =>
  attempt === 0 ? name : `${name} (retry ${attempt})`;

export async function runMetaStep<T extends Rpc.Serializable<T>>(
  step: MetaStepRunner,
  name: string,
  run: () => Promise<T>,
  { budget, subrequests = 1 }: MetaStepOptions = {},
): Promise<T> {
  const retries: Partial<Record<MetaErrorKind, number>> = {};
  for (let attempt = 0; ; attempt++) {
    budget?.charge(subrequests);
    const outcome = await step.do(attemptName(name, attempt), () =>
      attemptRun(run),
    );
    if (outcome.ok) return outcome.value;
    const delay = nextDelay(outcome.error, retries);
    if (delay === undefined) throw new MetaError(outcome.error);
    await step.sleep(`${name} (backoff ${attempt + 1})`, delay);
  }
}
