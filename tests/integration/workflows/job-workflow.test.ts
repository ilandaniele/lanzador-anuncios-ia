import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import {
  enqueueJob,
  type JobParams,
  jobInstanceId,
} from "../../../src/api/services/jobs";
import { JOB_HANDLERS } from "../../../src/workflows/jobs";
import { JOB_STEP_CONFIG } from "../../../src/workflows/jobs/job-context";

const jobWorkflow = env.JOB_WF!;

const errorEventsFor = (route: string) =>
  env.DB.prepare(
    "SELECT source, route, code, message, workspace_id FROM error_events WHERE route = ?",
  )
    .bind(route)
    .all();

const job = (key: string): JobParams => ({
  kind: "purge_workspace",
  key,
  workspaceId: null,
});

afterEach(() => {
  delete JOB_HANDLERS.purge_workspace;
});

describe("JobWorkflow", () => {
  it("records an error event after a job fails 3 times", async () => {
    let attempts = 0;
    JOB_HANDLERS.purge_workspace = async ({ step }) => {
      await step.do("purge", JOB_STEP_CONFIG, async () => {
        attempts++;
        throw new Error("D1 unavailable");
      });
    };
    const failing = job("fails-three-times");
    const id = jobInstanceId(failing);
    await using instance = await introspectWorkflowInstance(jobWorkflow, id);
    await instance.modify(async (m) => {
      await m.disableRetryDelays();
    });

    await enqueueJob(env, failing);

    await instance.waitForStatus("errored");
    expect(attempts).toBe(3);
    const { results } = await errorEventsFor(id);
    expect(results).toEqual([
      {
        source: "workflow",
        route: id,
        code: "JOB_FAILED",
        message: "D1 unavailable",
        workspace_id: null,
      },
    ]);
  });

  it("completes a job whose handler succeeds", async () => {
    const payloads: unknown[] = [];
    JOB_HANDLERS.purge_workspace = async ({ key, payload }) => {
      payloads.push({ key, payload });
    };
    const succeeding = { ...job("succeeds"), payload: { force: true } };
    await using instance = await introspectWorkflowInstance(
      jobWorkflow,
      jobInstanceId(succeeding),
    );

    await enqueueJob(env, succeeding);

    await instance.waitForStatus("complete");
    expect(payloads).toEqual([{ key: "succeeds", payload: { force: true } }]);
  });

  it("fails without retries when the kind has no handler", async () => {
    const orphan = job("no-handler");
    const id = jobInstanceId(orphan);
    await using instance = await introspectWorkflowInstance(jobWorkflow, id);

    await enqueueJob(env, orphan);

    await instance.waitForStatus("errored");
    const { results } = await errorEventsFor(id);
    expect(results).toHaveLength(1);
  });

  it("uses <kind>-<key> as the instance id and enqueues once", async () => {
    let runs = 0;
    JOB_HANDLERS.purge_workspace = async () => {
      runs++;
    };
    const repeated = job("ws-123");
    await using instance = await introspectWorkflowInstance(
      jobWorkflow,
      "purge_workspace-ws-123",
    );

    const first = await enqueueJob(env, repeated);
    const second = await enqueueJob(env, repeated);

    expect(first).toBe("purge_workspace-ws-123");
    expect(second).toBe(first);
    await instance.waitForStatus("complete");
    expect(runs).toBe(1);
  });

  it("throws when the job binding is missing", async () => {
    await expect(enqueueJob({}, job("unbound"))).rejects.toThrow(
      "JOB_WF binding is not configured",
    );
  });
});
