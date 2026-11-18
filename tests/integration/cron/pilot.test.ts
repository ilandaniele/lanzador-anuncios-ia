import type { WorkflowStep } from "cloudflare:workers";
import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { Env } from "../../../src/api/env";
import { AppError } from "../../../src/api/lib/errors";
import { insertDefaultPilotRules } from "../../../src/api/repositories/pilot-rules";
import { scheduled } from "../../../src/api/scheduled";
import {
  insightsCache,
  pilotRules,
  pilotRuns,
} from "../../../src/db/schema/pilot";
import { JOB_HANDLERS } from "../../../src/workflows/jobs";
import {
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
} from "../../helpers/factory";
import { FakeAiProvider } from "../../helpers/fake-ai-provider";
import { GRAPH_VERSION, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const db = drizzle(env.DB);
const HOUR = 3_600_000;
const SLOT = Date.UTC(2026, 10, 17, 6, 0);
const OFF_SLOT = Date.UTC(2026, 10, 17, 7, 0);
const PILOT_HOURS = [0, 6, 12, 18];
const CAMPAIGN_ID = "120200000000000100";

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

type EnqueuedJob = { id: string; params: Record<string, unknown> };

const recordingWorkflow = () => {
  const created: EnqueuedJob[] = [];
  const binding = {
    create: async (job: EnqueuedJob) => {
      created.push(job);
    },
    get: async () => {
      throw new Error("not found");
    },
  } as unknown as Workflow;
  return { binding, created };
};

const pilotJobsAt = async (scheduledTime: number) => {
  const jobs = recordingWorkflow();
  await scheduled(createScheduledController({ scheduledTime }), {
    ...env,
    JOB_WF: jobs.binding,
  });
  return jobs.created.filter(({ params }) => params.kind === "pilot_run");
};

const idsOf = (jobs: EnqueuedJob[]) =>
  jobs.map(({ params }) => params.workspaceId as string).sort();

interface SeedOptions {
  status?: "active" | "disabled" | "deleting";
  connection?: "active" | "reconnect_required" | "none";
  rules?: "default" | "all_disabled" | "none";
}

const seedEligible = async ({
  status = "active",
  connection = "active",
  rules = "default",
}: SeedOptions = {}) => {
  const { workspace } = await createWorkspace({ status });
  if (rules !== "none") {
    await insertDefaultPilotRules(env.DB, workspace.id, SLOT);
  }
  if (rules === "all_disabled") {
    await db
      .update(pilotRules)
      .set({ enabled: 0 })
      .where(eq(pilotRules.workspaceId, workspace.id));
  }
  if (connection !== "none") {
    await createMetaConnection(keyEnv, workspace.id, "pilot-cron-token", {
      status: connection,
    });
  }
  return workspace.id;
};

describe("scheduled pilot enqueue", () => {
  it("enqueues only eligible workspaces at 06:00 UTC", async () => {
    const eligible = await seedEligible();
    await seedEligible({ status: "disabled" });
    await seedEligible({ status: "deleting" });
    await seedEligible({ connection: "none" });
    await seedEligible({ connection: "reconnect_required" });
    await seedEligible({ rules: "none" });
    await seedEligible({ rules: "all_disabled" });

    const jobs = await pilotJobsAt(SLOT);

    expect(idsOf(jobs)).toEqual([eligible]);
    expect(jobs[0]?.params).toMatchObject({
      kind: "pilot_run",
      workspaceId: eligible,
    });
  });

  it("enqueues every eligible workspace with one job each", async () => {
    const first = await seedEligible();
    const second = await seedEligible();

    const jobs = await pilotJobsAt(SLOT);

    expect(idsOf(jobs)).toEqual(expect.arrayContaining([first, second]));
    expect(new Set(jobs.map(({ id }) => id)).size).toBe(jobs.length);
  });

  it("enqueues nothing at 07:00 UTC", async () => {
    await seedEligible();

    expect(await pilotJobsAt(OFF_SLOT)).toEqual([]);
  });

  it.each(PILOT_HOURS)("enqueues at hour %i UTC", async (hour) => {
    const eligible = await seedEligible();

    const jobs = await pilotJobsAt(Date.UTC(2026, 10, 17, hour, 0));

    expect(idsOf(jobs)).toContain(eligible);
  });

  it.each([1, 5, 7, 11, 13, 17, 19, 23])("skips hour %i UTC", async (hour) => {
    await seedEligible();

    expect(await pilotJobsAt(Date.UTC(2026, 10, 17, hour, 0))).toEqual([]);
  });

  it("uses the same job id inside one slot and a new one in the next", async () => {
    const eligible = await seedEligible();

    const jobFor = async (at: number) =>
      (await pilotJobsAt(at)).find(
        ({ params }) => params.workspaceId === eligible,
      );
    const slotRun = await jobFor(SLOT + 10 * 60_000);
    const sameSlot = await jobFor(SLOT + 20 * 60_000);
    const nextSlot = await jobFor(SLOT + 6 * HOUR);

    expect(slotRun?.id).toBe(sameSlot?.id);
    expect(slotRun?.id).not.toBe(nextSlot?.id);
    expect(slotRun?.id).toContain(eligible);
  });

  it("does not throw when the workflow binding fails", async () => {
    await seedEligible();
    const failing = {
      create: async () => {
        throw new Error("workflow down");
      },
      get: async () => {
        throw new Error("workflow down");
      },
    } as unknown as Workflow;

    await expect(
      scheduled(createScheduledController({ scheduledTime: SLOT }), {
        ...env,
        JOB_WF: failing,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("pilot_run job", () => {
  const AT = Date.now();
  const jobEnv = {
    ...env,
    ...keyEnv,
    GRAPH_API_VERSION: GRAPH_VERSION,
    META_APP_SECRET: "test-app-secret",
    AI_PROVIDER: new FakeAiProvider({
      generateText: [new AppError(502, "AI_UPSTREAM")],
    }),
  } as unknown as Env;

  const step = {
    do: (_name: string, _config: unknown, run: () => Promise<unknown>) => run(),
  } as unknown as WorkflowStep;

  const runJob = (workspaceId: string | null) =>
    JOB_HANDLERS.pilot_run!({
      env: jobEnv,
      step,
      key: `${workspaceId}-${Math.floor(AT / HOUR)}`,
      workspaceId,
      payload: {},
    });

  const runsOf = (workspaceId: string) =>
    db.select().from(pilotRuns).where(eq(pilotRuns.workspaceId, workspaceId));

  const seedWithInsights = async () => {
    const { workspace } = await createWorkspace();
    await insertDefaultPilotRules(env.DB, workspace.id, AT);
    const connection = await createMetaConnection(
      keyEnv,
      workspace.id,
      "pilot-job-token",
    );
    const asset = await createMetaAsset(workspace.id, connection.id);
    await db.insert(insightsCache).values({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      adAccountAssetId: asset.id,
      level: "ad",
      rangeKey: "today",
      dateFrom: "2026-11-17",
      dateTo: "2026-11-17",
      payload: JSON.stringify([
        {
          level: "ad",
          id: "6001",
          name: "Ad sin ventas",
          campaignId: CAMPAIGN_ID,
          adsetId: "120200000000000201",
          date: "2026-11-17",
          spendMinor: 5000,
          impressions: 1000,
          clicks: 20,
          purchases: 0,
          purchaseValueMinor: 0,
          roas: null,
          cpaMinor: null,
          ctr: 0.02,
          cpmMinor: 5000,
        },
      ]),
      rowCount: 1,
      fetchedAt: Date.now() - 60_000,
      expiresAt: Date.now() + HOUR,
    });
    server.use(
      metaReplies(`${asset.metaId}/campaigns`, {
        data: [
          {
            id: CAMPAIGN_ID,
            name: "CBO activa",
            effective_status: "ACTIVE",
            daily_budget: "5000",
            objective: "OUTCOME_SALES",
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          },
        ],
      }),
    );
    return workspace.id;
  };

  it("records a cron run without a triggering user", async () => {
    const workspaceId = await seedWithInsights();

    await runJob(workspaceId);

    expect(await runsOf(workspaceId)).toMatchObject([
      {
        trigger: "cron",
        triggeredBy: null,
        status: "done",
        proposalsCreated: 1,
      },
    ]);
  });

  it("skips quietly while another run is in progress", async () => {
    const workspaceId = await seedWithInsights();
    await db.insert(pilotRuns).values({
      id: crypto.randomUUID(),
      workspaceId,
      trigger: "manual",
      status: "running",
      startedAt: Date.now() - 60_000,
    });

    await expect(runJob(workspaceId)).resolves.toBeUndefined();

    expect(await runsOf(workspaceId)).toHaveLength(1);
  });

  it("rejects a job without a workspace", async () => {
    await expect(runJob(null)).rejects.toThrow("Invalid pilot_run job");
  });
});
