import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/api/app";
import {
  assertAiBudget,
  neuronsLeftToday,
  recordAiUsage,
} from "../../../src/api/services/ai-budget";
import { aiUsage, usageCounters } from "../../../src/db/schema/ops";
import { workspaces } from "../../../src/db/schema/workspaces";
import { measureAiUsage } from "../../../src/shared/ai-neuron-rates";
import { workspaceOverviewSchema } from "../../../src/shared/schemas/workspaces";
import { api, createWorkspace } from "../../helpers/factory";
import { openLimiter } from "../pipeline/helpers";

const NOW = Date.UTC(2026, 10, 17, 10, 0);
const DAY = "2026-11-17";
const MONTH = "2026-11";
const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const db = drizzle(env.DB);

const setCounter = (
  scope: "workspace" | "global",
  scopeId: string,
  period: string,
  value: number,
) =>
  db
    .insert(usageCounters)
    .values({
      scope,
      scopeId,
      period,
      metric: "ai_neurons",
      value,
      updatedAt: NOW,
    })
    .onConflictDoUpdate({
      target: [
        usageCounters.scope,
        usageCounters.scopeId,
        usageCounters.period,
        usageCounters.metric,
      ],
      set: { value },
    });

const readCounters = async (workspaceId: string) => {
  const rows = await db
    .select()
    .from(usageCounters)
    .where(eq(usageCounters.metric, "ai_neurons"));
  const valueOf = (scope: string, scopeId: string, period: string) =>
    rows.find(
      (row) =>
        row.scope === scope && row.scopeId === scopeId && row.period === period,
    )?.value;
  return {
    workspaceDay: valueOf("workspace", workspaceId, DAY),
    workspaceMonth: valueOf("workspace", workspaceId, MONTH),
    globalDay: valueOf("global", "app", DAY),
  };
};

const exhausted = (scope: string, resetsAt: string) => ({
  status: 422,
  code: "AI_BUDGET_EXHAUSTED",
  details: { scope, resetsAt },
});

describe("AI budget", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.delete(usageCounters).where(eq(usageCounters.scope, "global"));
  });

  describe("assertAiBudget", () => {
    it("passes while every scope has neurons left", async () => {
      const { workspace } = await createWorkspace();
      await setCounter("workspace", workspace.id, DAY, 1999);
      await setCounter("workspace", workspace.id, MONTH, 29999);
      await setCounter("global", "app", DAY, 8999);

      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).resolves.toBeUndefined();
    });

    it("blocks with workspace_day once the daily cap is reached", async () => {
      const { workspace } = await createWorkspace();
      await setCounter("workspace", workspace.id, DAY, 2000);

      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).rejects.toMatchObject(
        exhausted("workspace_day", "2026-11-18T00:00:00.000Z"),
      );
    });

    it("blocks with workspace_month until the first day of next month", async () => {
      const { workspace } = await createWorkspace();
      await setCounter("workspace", workspace.id, DAY, 100);
      await setCounter("workspace", workspace.id, MONTH, 30000);

      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).rejects.toMatchObject(
        exhausted("workspace_month", "2026-12-01T00:00:00.000Z"),
      );
    });

    it("blocks with global_day when the app-wide cap is reached", async () => {
      const { workspace } = await createWorkspace();
      await setCounter("global", "app", DAY, 9000);

      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).rejects.toMatchObject(
        exhausted("global_day", "2026-11-18T00:00:00.000Z"),
      );
    });

    it("ignores counters of other days and other workspaces", async () => {
      const { workspace } = await createWorkspace();
      const { workspace: other } = await createWorkspace();
      await setCounter("workspace", workspace.id, "2026-11-16", 2000);
      await setCounter("workspace", other.id, DAY, 2000);

      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).resolves.toBeUndefined();
    });

    it("lets the superadmin override beat the plan limits", async () => {
      const { workspace } = await createWorkspace();
      await setCounter("workspace", workspace.id, DAY, 150);
      await db
        .update(workspaces)
        .set({ aiDailyNeuronsOverride: 100 })
        .where(eq(workspaces.id, workspace.id));
      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).rejects.toMatchObject({ details: { scope: "workspace_day" } });

      await db
        .update(workspaces)
        .set({ aiDailyNeuronsOverride: 5000 })
        .where(eq(workspaces.id, workspace.id));
      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).resolves.toBeUndefined();
    });

    it("answers 404 for an unknown workspace", async () => {
      await expect(
        assertAiBudget(env.DB, env, crypto.randomUUID()),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("neuronsLeftToday", () => {
    it("returns the tightest remaining scope", async () => {
      const { workspace } = await createWorkspace();
      expect(await neuronsLeftToday(env.DB, env, workspace.id)).toBe(2000);

      await setCounter("global", "app", DAY, 8500);
      expect(await neuronsLeftToday(env.DB, env, workspace.id)).toBe(500);

      await setCounter("workspace", workspace.id, MONTH, 29900);
      expect(await neuronsLeftToday(env.DB, env, workspace.id)).toBe(100);
    });

    it("never goes below zero", async () => {
      const { workspace } = await createWorkspace();
      await setCounter("workspace", workspace.id, DAY, 2500);
      expect(await neuronsLeftToday(env.DB, env, workspace.id)).toBe(0);
    });
  });

  describe("recordAiUsage", () => {
    it("writes the usage rows and bumps the three counters once per invocation", async () => {
      const { workspace, owner } = await createWorkspace();
      const calls = [
        measureAiUsage(TEXT_MODEL, 600, 800),
        measureAiUsage(TEXT_MODEL, 300, 200),
      ];
      const total = calls[0]!.neurons + calls[1]!.neurons;

      await recordAiUsage(env.DB, workspace.id, "chat", calls, {
        userId: owner.id,
        refId: "session-1",
      });

      const rows = await db
        .select()
        .from(aiUsage)
        .where(eq(aiUsage.workspaceId, workspace.id));
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        feature: "chat",
        provider: "workers_ai",
        model: TEXT_MODEL,
        status: "ok",
        userId: owner.id,
        refId: "session-1",
        createdAt: NOW,
      });
      expect(rows.map((row) => row.neurons).sort()).toEqual(
        calls.map((call) => call.neurons).sort(),
      );
      expect(await readCounters(workspace.id)).toEqual({
        workspaceDay: total,
        workspaceMonth: total,
        globalDay: total,
      });
    });

    it("accumulates across invocations", async () => {
      const { workspace } = await createWorkspace();
      const call = measureAiUsage(TEXT_MODEL, 1000, 1000);

      await recordAiUsage(env.DB, workspace.id, "copy", call);
      await recordAiUsage(env.DB, workspace.id, "copy", call);

      expect(await readCounters(workspace.id)).toEqual({
        workspaceDay: call.neurons * 2,
        workspaceMonth: call.neurons * 2,
        globalDay: call.neurons * 2,
      });
    });

    it("logs a zero-neuron row without touching the counters", async () => {
      const { workspace } = await createWorkspace();

      await recordAiUsage(
        env.DB,
        workspace.id,
        "pilot",
        { model: TEXT_MODEL, inputTokens: 0, outputTokens: 0, neurons: 0 },
        { status: "blocked_budget" },
      );

      const rows = await db
        .select()
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.workspaceId, workspace.id),
            eq(aiUsage.status, "blocked_budget"),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(await readCounters(workspace.id)).toEqual({
        workspaceDay: undefined,
        workspaceMonth: undefined,
        globalDay: undefined,
      });
    });

    it("feeds the budget check and GET /api/w/:wid aiUsage", async () => {
      const { workspace, owner } = await createWorkspace();
      await recordAiUsage(env.DB, workspace.id, "tagging", {
        model: TEXT_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        neurons: 2000,
      });

      await expect(
        assertAiBudget(env.DB, env, workspace.id),
      ).rejects.toMatchObject({ details: { scope: "workspace_day" } });

      const response = await api(createApp(), `/api/w/${workspace.id}`, {
        as: owner,
        env: { RL_IP: openLimiter, RL_USER: openLimiter },
      });
      expect(
        workspaceOverviewSchema.parse(await response.json()).aiUsage,
      ).toMatchObject({
        neuronsToday: 2000,
        neuronsMonth: 2000,
        dailyCap: 2000,
        globalExhausted: false,
        resetsAt: "2026-11-18T00:00:00.000Z",
      });
    });
  });
});
