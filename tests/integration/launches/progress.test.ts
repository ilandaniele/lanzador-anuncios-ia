import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { launchItems, launches } from "../../../src/db/schema/launches";
import { launchProgressSchema } from "../../../src/shared/schemas/launch";
import { api, createLaunch, expectError } from "../../helpers/factory";
import {
  seedTenantPair,
  seedWorkspaceWithRoles,
} from "../../helpers/tenant-pair";
import { openLimiter } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);
const POLL_MS = 3000;
const POLL_LIMIT = 30;
const BASE_AT = Date.UTC(2026, 2, 5, 15, 0);
const openLimits = { RL_IP: openLimiter, RL_USER: openLimiter };

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { env: openLimits, ...options });

const progressPath = (workspaceId: string, launchId: string, query = "") =>
  `/api/w/${workspaceId}/launches/${launchId}/progress${query}`;

const retryPath = (workspaceId: string, launchId: string) =>
  `/api/w/${workspaceId}/launches/${launchId}/retry-failed`;

const createdInstances: { id: string; params: unknown }[] = [];
const fakeWorkflow = {
  create: async (options: { id: string; params: unknown }) => {
    createdInstances.push(options);
  },
  get: async () => undefined,
} as unknown as Workflow;

const retryEnv = { ...openLimits, LAUNCH_WF: fakeWorkflow };

const seedItem = async (
  workspaceId: string,
  launchId: string,
  position: number,
  overrides: Partial<typeof launchItems.$inferInsert> = {},
) => {
  const item = {
    id: crypto.randomUUID(),
    workspaceId,
    launchId,
    position,
    source: "upload",
    adName: `Anuncio ${position}`,
    createdAt: BASE_AT,
    updatedAt: BASE_AT,
    ...overrides,
  };
  await db.insert(launchItems).values(item);
  return item;
};

const readProgress = async (response: Response) => {
  expect(response.status).toBe(200);
  return launchProgressSchema.parse(await response.json());
};

const launchRow = (id: string) =>
  db
    .select()
    .from(launches)
    .where(eq(launches.id, id))
    .then(([row]) => row!);

const itemRow = (id: string) =>
  db
    .select()
    .from(launchItems)
    .where(eq(launchItems.id, id))
    .then(([row]) => row!);

describe("GET /api/w/:wid/launches/:id/progress", () => {
  it("returns 401 without a session", async () => {
    const { A } = await seedTenantPair();

    await expectError(
      await call(progressPath(A.workspace.id, A.launch.id)),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 404 for a launch of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(progressPath(A.workspace.id, B.launch.id), {
        as: A.users.viewer,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 to a user outside the workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await call(progressPath(B.workspace.id, B.launch.id), {
        as: A.users.owner,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 for an unknown id", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();

    await expectError(
      await call(progressPath(workspace.id, crypto.randomUUID()), {
        as: users.viewer,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 400 for a malformed since", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id);

    await expectError(
      await call(progressPath(workspace.id, launch.id, "?since=yesterday"), {
        as: users.viewer,
      }),
      400,
      "VALIDATION",
    );
  });

  it("returns status, phase, counts and every item to a viewer", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const checks = [{ ok: true, code: "PAUSED", text: "Todo en pausa" }];
    const launch = await createLaunch(workspace.id, {
      status: "running",
      phase: "items",
      itemsTotal: 3,
      itemsDone: 1,
      itemsFailed: 1,
      checks: JSON.stringify(checks),
      updatedAt: BASE_AT + 10,
    });
    await seedItem(workspace.id, launch.id, 0, {
      status: "done",
      metaAdId: "ad-1",
    });
    await seedItem(workspace.id, launch.id, 1, {
      status: "failed",
      errorCode: "META_ERROR",
      errorMessage: "Texto rechazado",
    });
    await seedItem(workspace.id, launch.id, 2, { status: "creating_ad" });

    const progress = await readProgress(
      await call(progressPath(workspace.id, launch.id), { as: users.viewer }),
    );

    expect(progress).toEqual({
      status: "running",
      phase: "items",
      counts: { total: 3, done: 1, failed: 1 },
      items: [
        {
          id: expect.any(String),
          position: 0,
          status: "done",
          adName: "Anuncio 0",
          metaAdId: "ad-1",
        },
        {
          id: expect.any(String),
          position: 1,
          status: "failed",
          adName: "Anuncio 1",
          error: "Texto rechazado",
        },
        {
          id: expect.any(String),
          position: 2,
          status: "creating_ad",
          adName: "Anuncio 2",
        },
      ],
      checks,
      updatedAt: new Date(BASE_AT + 10).toISOString(),
      nextPollMs: POLL_MS,
    });
  });

  it("returns only the items changed since the given updatedAt", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id, {
      status: "running",
      phase: "items",
      updatedAt: BASE_AT + 100,
    });
    await seedItem(workspace.id, launch.id, 0, {
      status: "done",
      updatedAt: BASE_AT + 50,
    });
    const changed = await seedItem(workspace.id, launch.id, 1, {
      status: "creating_ad",
      updatedAt: BASE_AT + 200,
    });

    const progress = await readProgress(
      await call(
        progressPath(
          workspace.id,
          launch.id,
          `?since=${encodeURIComponent(new Date(BASE_AT + 100).toISOString())}`,
        ),
        { as: users.viewer },
      ),
    );

    expect(progress.items.map(({ id }) => id)).toEqual([changed.id]);
    expect(progress.updatedAt).toBe(new Date(BASE_AT + 200).toISOString());
  });

  it("returns no items and keeps the launch updatedAt when nothing changed", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id, {
      status: "running",
      updatedAt: BASE_AT + 100,
    });
    await seedItem(workspace.id, launch.id, 0, { updatedAt: BASE_AT + 50 });

    const progress = await readProgress(
      await call(
        progressPath(
          workspace.id,
          launch.id,
          `?since=${encodeURIComponent(new Date(BASE_AT + 100).toISOString())}`,
        ),
        { as: users.viewer },
      ),
    );

    expect(progress.items).toEqual([]);
    expect(progress.updatedAt).toBe(new Date(BASE_AT + 100).toISOString());
    expect(progress.nextPollMs).toBe(POLL_MS);
  });

  it.each(["queued", "running", "verifying", "activating"])(
    "keeps polling every 3000 ms while the launch is %s",
    async (status) => {
      const { workspace, users } = await seedWorkspaceWithRoles();
      const launch = await createLaunch(workspace.id, { status });

      const progress = await readProgress(
        await call(progressPath(workspace.id, launch.id), { as: users.viewer }),
      );

      expect(progress.nextPollMs).toBe(POLL_MS);
    },
  );

  it.each([
    "paused_verified",
    "verified_with_errors",
    "active",
    "scheduled",
    "failed",
  ])("stops polling when the launch is %s", async (status) => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id, { status });

    const progress = await readProgress(
      await call(progressPath(workspace.id, launch.id), { as: users.viewer }),
    );

    expect(progress.nextPollMs).toBeNull();
  });

  it("answers 429 on the 31st request in one minute", async () => {
    const { workspace, users } = await seedWorkspaceWithRoles();
    const launch = await createLaunch(workspace.id);
    const poll = () =>
      call(progressPath(workspace.id, launch.id), { as: users.viewer });

    for (let count = 0; count < POLL_LIMIT; count++) {
      expect((await poll()).status).toBe(200);
    }

    const blocked = await poll();
    await expectError(blocked, 429, "RATE_LIMITED");
    expect(blocked.headers.get("Retry-After")).toBe("60");
  });
});

describe("POST /api/w/:wid/launches/:id/retry-failed", () => {
  const seedFailedLaunch = async (
    overrides: Partial<typeof launches.$inferInsert> = {},
  ) => {
    const tenant = await seedWorkspaceWithRoles();
    const launch = await createLaunch(tenant.workspace.id, {
      status: "verified_with_errors",
      phase: "verify",
      attempt: 1,
      itemsTotal: 2,
      itemsDone: 1,
      itemsFailed: 1,
      finishedAt: BASE_AT,
      startedAt: BASE_AT,
      ...overrides,
    });
    const done = await seedItem(tenant.workspace.id, launch.id, 0, {
      status: "done",
      metaAdId: "ad-1",
    });
    const failed = await seedItem(tenant.workspace.id, launch.id, 1, {
      status: "failed",
      metaCreativeId: "creative-2",
      errorCode: "META_ERROR",
      errorMessage: "Texto rechazado",
    });
    return { ...tenant, launch, done, failed };
  };

  const retry = (
    { workspace, launch, users }: Awaited<ReturnType<typeof seedFailedLaunch>>,
    options: Caller = {},
  ) =>
    api(app, retryPath(workspace.id, launch.id), {
      env: retryEnv,
      method: "POST",
      as: users.editor,
      body: { confirm: true },
      ...options,
    });

  it("returns 401 without a session", async () => {
    const seeded = await seedFailedLaunch();

    await expectError(
      await retry(seeded, { as: undefined }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("returns 403 to a viewer", async () => {
    const seeded = await seedFailedLaunch();

    await expectError(
      await retry(seeded, { as: seeded.users.viewer }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("returns 404 for a launch of another workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await api(app, retryPath(A.workspace.id, B.launch.id), {
        env: retryEnv,
        method: "POST",
        as: A.users.editor,
        body: { confirm: true },
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 404 to a user outside the workspace", async () => {
    const { A, B } = await seedTenantPair();

    await expectError(
      await api(app, retryPath(B.workspace.id, B.launch.id), {
        env: retryEnv,
        method: "POST",
        as: A.users.editor,
        body: { confirm: true },
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns 400 without confirm", async () => {
    const seeded = await seedFailedLaunch();

    await expectError(await retry(seeded, { body: {} }), 400, "VALIDATION");
  });

  it("returns 409 NOTHING_TO_RETRY when no item failed", async () => {
    const seeded = await seedFailedLaunch({
      status: "paused_verified",
      itemsDone: 2,
      itemsFailed: 0,
    });

    await expectError(await retry(seeded), 409, "NOTHING_TO_RETRY");
  });

  it.each(["draft", "simulated", "discarded"])(
    "returns 409 NOTHING_TO_RETRY for a %s launch",
    async (status) => {
      const seeded = await seedFailedLaunch({ status, itemsFailed: 0 });

      await expectError(await retry(seeded), 409, "NOTHING_TO_RETRY");
    },
  );

  it.each(["queued", "running", "verifying", "activating"])(
    "returns 409 LAUNCH_RUNNING while the launch is %s",
    async (status) => {
      const seeded = await seedFailedLaunch({ status });

      await expectError(await retry(seeded), 409, "LAUNCH_RUNNING");
    },
  );

  it("starts a new attempt that only requeues the failed items", async () => {
    createdInstances.length = 0;
    const seeded = await seedFailedLaunch({
      errorCode: "META_ERROR",
      errorMessage: "algo fallo",
    });

    const response = await retry(seeded);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued" });
    expect(await launchRow(seeded.launch.id)).toMatchObject({
      status: "queued",
      phase: "preflight",
      attempt: 2,
      workflowInstanceId: `launch-${seeded.launch.id}-2`,
      itemsTotal: 2,
      itemsDone: 1,
      itemsFailed: 0,
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
      startedAt: BASE_AT,
    });
    expect(await itemRow(seeded.failed.id)).toMatchObject({
      status: "pending",
      metaCreativeId: "creative-2",
      errorCode: null,
      errorMessage: null,
    });
    expect(await itemRow(seeded.done.id)).toMatchObject({
      status: "done",
      metaAdId: "ad-1",
      updatedAt: BASE_AT,
    });
    expect(createdInstances).toEqual([
      {
        id: `launch-${seeded.launch.id}-2`,
        params: {
          launchId: seeded.launch.id,
          workspaceId: seeded.workspace.id,
          userId: seeded.users.editor.id,
          attempt: 2,
          segment: 0,
        },
      },
    ]);
  });

  it("retries a launch that failed as a whole", async () => {
    const seeded = await seedFailedLaunch({
      status: "failed",
      errorCode: "META_ERROR",
    });

    expect((await retry(seeded)).status).toBe(202);
  });

  it("answers 409 LAUNCH_RUNNING to a second retry", async () => {
    const seeded = await seedFailedLaunch();

    expect((await retry(seeded)).status).toBe(202);
    await expectError(await retry(seeded), 409, "LAUNCH_RUNNING");
  });
});
