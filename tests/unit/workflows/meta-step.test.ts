import { describe, expect, it, vi } from "vitest";
import {
  classifyMetaError,
  MetaError,
  networkMetaError,
} from "../../../src/api/integrations/meta/errors";
import {
  type MetaStepRunner,
  RATE_LIMIT_DELAYS_MS,
  runMetaStep,
  TRANSIENT_DELAYS_MS,
} from "../../../src/workflows/lib/meta-step";
import { SubrequestBudget } from "../../../src/workflows/lib/subrequest-budget";

function fakeStep() {
  const steps: string[] = [];
  const sleeps: [string, number][] = [];
  const step = {
    do: async (name: string, callback: () => Promise<unknown>) => {
      steps.push(name);
      return callback();
    },
    sleep: async (name: string, duration: number) => {
      sleeps.push([name, duration]);
    },
  } as unknown as MetaStepRunner;
  return { step, steps, sleeps };
}

const graphError = (code: number, httpStatus = 400) =>
  classifyMetaError(httpStatus, { error: { code, message: "boom" } });

function failingThen(errors: MetaError[], value = "ok") {
  const run = vi.fn(async () => value);
  for (const error of errors) run.mockRejectedValueOnce(error);
  return run;
}

describe("runMetaStep", () => {
  it("returns the value of a successful step without sleeping", async () => {
    const { step, steps, sleeps } = fakeStep();
    await expect(runMetaStep(step, "create ad", async () => 42)).resolves.toBe(
      42,
    );
    expect(steps).toEqual(["create ad"]);
    expect(sleeps).toEqual([]);
  });

  it("sleeps 60 s on code 17 and retries", async () => {
    const { step, steps, sleeps } = fakeStep();
    const run = failingThen([graphError(17)]);
    await expect(runMetaStep(step, "create ad", run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleeps.map(([, ms]) => ms)).toEqual([60_000]);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("follows the rate limit schedule and gives up after 6 retries", async () => {
    const { step, sleeps } = fakeStep();
    const run = vi.fn(async () => {
      throw graphError(80004);
    });
    await expect(runMetaStep(step, "create ad", run)).rejects.toMatchObject({
      kind: "rate_limit",
      code: 80004,
    });
    expect(run).toHaveBeenCalledTimes(7);
    expect(sleeps.map(([, ms]) => ms)).toEqual([
      60_000, 120_000, 240_000, 480_000, 900_000, 900_000,
    ]);
    expect(RATE_LIMIT_DELAYS_MS).toHaveLength(6);
  });

  it("waits estimated_time_to_regain_access when Meta sends it", async () => {
    const { step, sleeps } = fakeStep();
    const throttled = classifyMetaError(400, { error: { code: 4 } }, 300_000);
    await runMetaStep(step, "create ad", failingThen([throttled]));
    expect(sleeps.map(([, ms]) => ms)).toEqual([300_000]);
  });

  it("does not retry code 190 and rethrows it as a MetaError", async () => {
    const { step, sleeps } = fakeStep();
    const run = failingThen([graphError(190)]);
    const error = await runMetaStep(step, "create ad", run).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(MetaError);
    expect(error).toMatchObject({ kind: "session", code: 190 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("does not retry permission or param errors", async () => {
    for (const code of [10, 100]) {
      const { step, sleeps } = fakeStep();
      const run = failingThen([graphError(code)]);
      await expect(runMetaStep(step, "create ad", run)).rejects.toMatchObject({
        code,
      });
      expect(run).toHaveBeenCalledTimes(1);
      expect(sleeps).toEqual([]);
    }
  });

  it("retries 5xx and network errors 3 times at 10, 30 and 90 s", async () => {
    const { step, sleeps } = fakeStep();
    const run = vi.fn(async () => {
      throw graphError(1, 503);
    });
    run.mockRejectedValueOnce(networkMetaError(new Error("reset")));
    await expect(runMetaStep(step, "create ad", run)).rejects.toMatchObject({
      kind: "transient",
    });
    expect(run).toHaveBeenCalledTimes(4);
    expect(sleeps.map(([, ms]) => ms)).toEqual(TRANSIENT_DELAYS_MS);
    expect(TRANSIENT_DELAYS_MS).toEqual([10_000, 30_000, 90_000]);
  });

  it("propagates non-Meta errors from the step", async () => {
    const { step, sleeps } = fakeStep();
    const run = vi.fn(async () => {
      throw new TypeError("bug");
    });
    await expect(runMetaStep(step, "create ad", run)).rejects.toThrow("bug");
    expect(sleeps).toEqual([]);
  });

  it("charges the budget once per attempt with the step weight", async () => {
    const { step } = fakeStep();
    const budget = new SubrequestBudget();
    await runMetaStep(step, "batch", failingThen([graphError(17)]), {
      budget,
      subrequests: 5,
    });
    expect(budget.used).toBe(10);
  });
});
