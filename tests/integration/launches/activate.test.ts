import { introspectWorkflow } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { launches } from "../../../src/db/schema/launches";
import { auditLog } from "../../../src/db/schema/ops";
import { expectError } from "../../helpers/factory";
import { GRAPH_BASE_URL } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";
import {
  call,
  db,
  fakeMeta,
  introspect,
  launchRow,
  type LaunchSetup,
  setup,
  startLaunch,
} from "../workflows/launch-fixture";

const HOUR_MS = 60 * 60 * 1000;

interface BatchItem {
  method: string;
  relative_url: string;
  body?: string;
}

const activate = (
  context: LaunchSetup,
  body: Record<string, unknown> = { confirm: true },
  as = context.editor,
) => call(context, "activate", { as, body });

const markPaused = (id: string, checksOk: number) =>
  db
    .update(launches)
    .set({ status: "paused_verified", checksOk })
    .where(eq(launches.id, id));

const activationAudits = (launchId: string) =>
  db
    .select({ result: auditLog.result, actorUserId: auditLog.actorUserId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.launchId, launchId),
        eq(auditLog.action, "meta.launch.activate"),
      ),
    );

function fakeActivation(rejected = new Set<string>()) {
  const statuses = new Map<string, string>();
  const posts: { id: string; form: URLSearchParams }[] = [];
  const reply = (code: number, body: unknown) => ({
    code,
    headers: [],
    body: JSON.stringify(body),
  });
  const handle = ({ method, relative_url, body }: BatchItem) => {
    const id = relative_url.split("?")[0]!;
    if (method === "GET") {
      return reply(200, { id, status: statuses.get(id) ?? "PAUSED" });
    }
    if (rejected.has(id)) {
      return reply(400, { error: { message: "Invalid", code: 100 } });
    }
    const form = new URLSearchParams(body);
    posts.push({ id, form });
    statuses.set(id, form.get("status")!);
    return reply(200, { success: true });
  };
  server.use(
    http.post(`${GRAPH_BASE_URL}/`, async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      const batch = JSON.parse(form.get("batch") ?? "[]") as BatchItem[];
      return HttpResponse.json(batch.map(handle));
    }),
  );
  return { posts, statuses, rejected };
}

async function launched(itemCount = 2) {
  const context = await setup(itemCount);
  fakeMeta();
  await using instance = await introspect(context);
  await startLaunch(context, instance);
  await instance.waitForStatus("complete");
  expect(await launchRow(context.launch.id)).toMatchObject({
    status: "paused_verified",
    checksOk: 1,
  });
  return context;
}

async function activateAndWait(
  context: LaunchSetup,
  body?: Record<string, unknown>,
) {
  await using jobs = await introspectWorkflow(env.JOB_WF!);
  const response = await activate(context, body);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: "activating" });
  const [job] = await jobs.get();
  await job!.waitForStatus("complete");
  return launchRow(context.launch.id);
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("POST /api/w/:wid/launches/:id/activate", () => {
  it("activates campaign, adset and ads in one batch", async () => {
    const context = await launched(2);
    const meta = fakeActivation();

    const row = await activateAndWait(context);

    expect(meta.posts.map(({ id }) => id)).toEqual([
      "campaigns-1",
      "adsets-1",
      "ads-1",
      "ads-2",
    ]);
    expect(meta.posts.every(({ form }) => !form.has("start_time"))).toBe(true);
    expect(row).toMatchObject({
      status: "active",
      phase: "activate",
      activatedBy: context.editor.id,
      errorMessage: null,
    });
    expect(row.activatedAt).toEqual(expect.any(Number));
    expect(await activationAudits(context.launch.id)).toEqual([
      { result: "ok", actorUserId: context.editor.id },
    ]);
  });

  it("schedules the launch with start_time on the adset", async () => {
    const context = await launched(1);
    const meta = fakeActivation();
    const startAt = new Date(Date.now() + 2 * HOUR_MS).toISOString();

    const row = await activateAndWait(context, { confirm: true, startAt });

    const adset = meta.posts.find(({ id }) => id === "adsets-1")!;
    expect(adset.form.get("start_time")).toBe(startAt);
    expect(
      meta.posts
        .filter(({ id }) => id !== "adsets-1")
        .every(({ form }) => !form.has("start_time")),
    ).toBe(true);
    expect(row).toMatchObject({
      status: "scheduled",
      startAt: Date.parse(startAt),
    });
  });

  it("reports a partial activation and lets the user retry", async () => {
    const context = await launched(2);
    const meta = fakeActivation(new Set(["ads-2"]));

    const partial = await activateAndWait(context);

    expect(partial).toMatchObject({
      status: "paused_verified",
      errorCode: "META_ERROR",
      errorMessage: "Se activaron 3 de 4. Volvé a tocar Activar.",
      activatedAt: null,
    });
    expect(await activationAudits(context.launch.id)).toEqual([
      { result: "error", actorUserId: context.editor.id },
    ]);

    meta.rejected.clear();
    const retried = await activateAndWait(context);

    expect(retried).toMatchObject({
      status: "active",
      errorCode: null,
      errorMessage: null,
    });
    expect(meta.statuses.get("ads-2")).toBe("ACTIVE");
  });

  it("returns 409 CHECKS_NOT_GREEN when the checks are red", async () => {
    const context = await setup(1);
    await markPaused(context.launch.id, 0);

    await expectError(await activate(context), 409, "CHECKS_NOT_GREEN");
  });

  it("returns 409 NOT_PAUSED for a launch that never ran", async () => {
    const context = await setup(1);

    await expectError(await activate(context), 409, "NOT_PAUSED");
  });

  it("returns 409 NOT_PAUSED while an activation is running", async () => {
    const context = await setup(1);
    await db
      .update(launches)
      .set({ status: "activating", checksOk: 1 })
      .where(eq(launches.id, context.launch.id));

    await expectError(await activate(context), 409, "NOT_PAUSED");
  });

  it("returns 422 START_IN_PAST for a past start", async () => {
    const context = await setup(1);
    await markPaused(context.launch.id, 1);
    const startAt = new Date(Date.now() - HOUR_MS).toISOString();

    await expectError(
      await activate(context, { confirm: true, startAt }),
      422,
      "START_IN_PAST",
    );
    expect((await launchRow(context.launch.id)).status).toBe("paused_verified");
  });

  it("returns 404 for a launch of another workspace", async () => {
    const context = await setup(1);
    const other = await setup(1);
    await markPaused(context.launch.id, 1);

    await expectError(
      await activate({ ...other, launch: context.launch }),
      404,
      "NOT_FOUND",
    );
    expect((await launchRow(context.launch.id)).status).toBe("paused_verified");
  });

  it("returns 403 for a viewer", async () => {
    const context = await setup(1);
    await markPaused(context.launch.id, 1);

    await expectError(
      await activate(context, { confirm: true }, context.viewer),
      403,
      "FORBIDDEN_ROLE",
    );
  });
});
