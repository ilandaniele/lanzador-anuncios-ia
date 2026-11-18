import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { creatives } from "../../../src/db/schema/creatives";
import { launches } from "../../../src/db/schema/launches";
import sessionFixture from "../../fixtures/meta/error-session.json";
import { expectError } from "../../helpers/factory";
import { metaFails } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  ACCOUNT_META_ID,
  auditActions,
  call,
  db,
  fakeMeta,
  introspect,
  itemRows,
  launchRow,
  setup,
  simulate,
  start,
  startLaunch,
} from "./launch-fixture";

afterEach(() => {
  server.events.removeAllListeners();
});

describe("LaunchWorkflow", () => {
  it("creates 1 campaign, 1 adset and 7 ads in 2 batches", async () => {
    const context = await setup(7);
    const meta = fakeMeta();
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    expect(
      await instance.waitForStepResult({ name: "read counters 1" }),
    ).toMatchObject({ itemsDone: 5, itemsFailed: 0 });
    expect(
      await instance.waitForStepResult({ name: "read counters 2" }),
    ).toMatchObject({ itemsDone: 7, itemsFailed: 0 });
    expect(meta.campaigns).toHaveLength(1);
    expect(meta.adsets).toHaveLength(1);
    expect(meta.adsets[0]!.get("campaign_id")).toBe("campaigns-1");
    expect(meta.adcreatives).toHaveLength(7);
    expect(meta.ads).toHaveLength(7);
    expect(meta.ads.every((form) => form.get("adset_id") === "adsets-1")).toBe(
      true,
    );
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "paused_verified",
      checksOk: 1,
      phase: "verify",
      attempt: 1,
      workflowInstanceId: `launch-${context.launch.id}-1`,
      metaCampaignId: "campaigns-1",
      metaAdsetId: "adsets-1",
      itemsTotal: 7,
      itemsDone: 7,
      itemsFailed: 0,
    });
    const items = await itemRows(context.launch.id);
    expect(items.map(({ status }) => status)).toEqual(Array(7).fill("done"));
    expect(items.every(({ metaAdId }) => metaAdId?.startsWith("ads-"))).toBe(
      true,
    );
    const actions = (await auditActions(context.launch.id)).map(
      ({ action }) => action,
    );
    expect(
      actions.filter((action) => action === "launch.campaign.create"),
    ).toHaveLength(1);
    expect(
      actions.filter((action) => action === "launch.adset.create"),
    ).toHaveLength(1);
    expect(
      actions.filter((action) => action === "launch.creative.create"),
    ).toHaveLength(7);
    expect(
      actions.filter((action) => action === "launch.ad.create"),
    ).toHaveLength(7);
  });

  it("does not duplicate the campaign when its step is retried", async () => {
    const context = await setup(1);
    const meta = fakeMeta({ campaigns: { failFirstPost: true } });
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    expect(meta.campaigns).toHaveLength(1);
    expect(meta.adsets[0]!.get("campaign_id")).toBe("campaigns-1");
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "paused_verified",
      metaCampaignId: "campaigns-1",
      itemsDone: 1,
    });
  });

  it("fails one item with Meta's message and keeps going", async () => {
    const context = await setup(2);
    fakeMeta({ ads: { rejectName: "Anuncio 2" } });
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("complete");

    const [first, second] = await itemRows(context.launch.id);
    expect(first).toMatchObject({ status: "done" });
    expect(second).toMatchObject({
      status: "failed",
      errorCode: "META_ERROR",
      errorMessage: "Texto rechazado: El texto no cumple las políticas",
    });
    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "verified_with_errors",
      itemsDone: 1,
      itemsFailed: 1,
    });
  });

  it("fails the launch when Meta rejects the campaign", async () => {
    const context = await setup(1);
    fakeMeta();
    server.use(
      metaFails(`${ACCOUNT_META_ID}/campaigns`, {
        error: { message: "Invalid parameter", code: 100 },
      }),
    );
    await using instance = await introspect(context);

    await startLaunch(context, instance);
    await instance.waitForStatus("errored");

    expect(await launchRow(context.launch.id)).toMatchObject({
      status: "failed",
      errorCode: "META_ERROR",
      metaCampaignId: null,
    });
  });
});

describe("POST /api/w/:wid/launches/:id/start", () => {
  it("returns 409 NOT_SIMULATED for a draft", async () => {
    const context = await setup(1);

    await expectError(await start(context, "hash"), 409, "NOT_SIMULATED");
  });

  it("returns 409 PLAN_CHANGED when the plan hash is stale", async () => {
    const context = await setup(1);
    await simulate(context);

    await expectError(await start(context, "stale"), 409, "PLAN_CHANGED");
  });

  it("returns 409 PLAN_CHANGED when the draft changed after simulate", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);
    await db
      .update(launches)
      .set({
        draft: JSON.stringify({ ...context.draft, dailyBudgetMinor: 3000 }),
      })
      .where(eq(launches.id, context.launch.id));

    await expectError(await start(context, planHash), 409, "PLAN_CHANGED");
    expect((await launchRow(context.launch.id)).status).toBe("simulated");
  });

  it("returns 422 BLOCKERS when a blocker appeared after simulate", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);
    await db
      .update(creatives)
      .set({ status: "processing" })
      .where(eq(creatives.id, context.images[0]!.id));

    await expectError(await start(context, planHash), 422, "BLOCKERS");
  });

  it("returns 409 META_RECONNECT_REQUIRED when the token was revoked", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);
    server.use(metaFails(ACCOUNT_META_ID, sessionFixture, 401));

    await expectError(
      await start(context, planHash),
      409,
      "META_RECONNECT_REQUIRED",
    );
  });

  it("returns 400 without confirm", async () => {
    const context = await setup(1);
    const planHash = await simulate(context);

    await expectError(
      await call(context, "start", { body: { planHash } }),
      400,
      "VALIDATION",
    );
  });
});
