import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app";
import type { Env } from "../../src/api/env";
import { newId } from "../../src/api/lib/ids";
import { now, utcPeriods } from "../../src/api/lib/time";
import { errorEvents, usageCounters } from "../../src/db/schema/ops";
import {
  adminErrorsPageSchema,
  adminUsageSchema,
} from "../../src/shared/schemas/admin";
import {
  api,
  createUser,
  createWorkspace,
  expectError,
} from "../helpers/factory";
import { openLimiter, testEnv, trustedHeaders } from "./pipeline/helpers";

const CLIENT_ERROR_LIMIT = 20;

const app = createApp();
const db = drizzle(env.DB);
const periods = utcPeriods(now());

const baseEnv: Partial<Env> = { RL_IP: openLimiter, RL_USER: openLimiter };

const countingLimiter = (limit: number): RateLimit => {
  const seen = new Map<string, number>();
  return {
    limit: async ({ key }) => {
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      return { success: count <= limit };
    },
  };
};

type Caller = NonNullable<Parameters<typeof api>[2]>;

const call = (path: string, options: Caller = {}) =>
  api(app, path, { ...options, env: { ...baseEnv, ...options.env } });

const superadmin = () => createUser({ isSuperadmin: 1 });

const seedCounter = (
  scope: "workspace" | "global",
  scopeId: string,
  period: string,
  metric: string,
  value: number,
) =>
  db
    .insert(usageCounters)
    .values({ scope, scopeId, period, metric, value, updatedAt: now() })
    .onConflictDoUpdate({
      target: [
        usageCounters.scope,
        usageCounters.scopeId,
        usageCounters.period,
        usageCounters.metric,
      ],
      set: { value },
    });

const seedErrorEvent = (
  overrides: Partial<typeof errorEvents.$inferInsert> = {},
) =>
  db
    .insert(errorEvents)
    .values({
      id: newId(),
      source: "api",
      message: "boom",
      createdAt: now(),
      ...overrides,
    })
    .returning()
    .then(([row]) => row!);

const postClientError = (
  body: unknown,
  { ip = "203.0.113.7", limiter = openLimiter } = {},
) =>
  app.request(
    "/api/client-errors",
    {
      method: "POST",
      headers: {
        ...trustedHeaders,
        "Content-Type": "application/json",
        "CF-Connecting-IP": ip,
      },
      body: JSON.stringify(body),
    },
    testEnv({ ...baseEnv, RL_CLIENT_ERR: limiter }),
  );

const clientErrorRows = (route: string) =>
  db.select().from(errorEvents).where(eq(errorEvents.route, route));

describe("GET /api/admin/usage", () => {
  it("returns 401 without a session", async () => {
    await expectError(await call("/api/admin/usage"), 401, "UNAUTHENTICATED");
  });

  it("returns 404 for a non superadmin", async () => {
    const { owner } = await createWorkspace();
    await expectError(
      await call("/api/admin/usage", { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns monthly neurons and metaCalls per workspace and the global neurons of the day", async () => {
    const { workspace: busy } = await createWorkspace();
    const { workspace: quiet } = await createWorkspace();
    await seedCounter("workspace", busy.id, periods.month, "ai_neurons", 1200);
    await seedCounter("workspace", busy.id, periods.month, "meta_calls", 87);
    await seedCounter("workspace", busy.id, periods.day, "ai_neurons", 300);
    await seedCounter("global", "app", periods.day, "ai_neurons", 4500);

    const response = await call("/api/admin/usage?limit=100", {
      as: await superadmin(),
    });

    expect(response.status).toBe(200);
    const body = adminUsageSchema.parse(await response.json());
    expect(body.global.neuronsToday).toBe(4500);
    expect(body.workspaces).toContainEqual({
      id: busy.id,
      name: busy.name,
      neurons: 1200,
      metaCalls: 87,
    });
    expect(body.workspaces).toContainEqual({
      id: quiet.id,
      name: quiet.name,
      neurons: 0,
      metaCalls: 0,
    });
  });

  it("reads another month and paginates workspaces", async () => {
    const { workspace } = await createWorkspace();
    await seedCounter("workspace", workspace.id, "2025-01", "ai_neurons", 77);

    const response = await call("/api/admin/usage?month=2025-01&limit=1", {
      as: await superadmin(),
    });

    const body = adminUsageSchema.parse(await response.json());
    expect(body.workspaces).toHaveLength(1);
    expect(body.nextCursor).not.toBeNull();
  });

  it("rejects a malformed month", async () => {
    await expectError(
      await call("/api/admin/usage?month=2025-13", { as: await superadmin() }),
      400,
      "VALIDATION",
    );
  });
});

describe("GET /api/admin/errors", () => {
  it("returns 404 for a non superadmin", async () => {
    const { owner } = await createWorkspace();
    await expectError(
      await call("/api/admin/errors", { as: owner }),
      404,
      "NOT_FOUND",
    );
  });

  it("lists newest first, filters by source and paginates", async () => {
    const admin = await superadmin();
    const base = now() + 10_000_000;
    const older = await seedErrorEvent({
      source: "cron",
      message: "old cron failure",
      createdAt: base,
    });
    const newer = await seedErrorEvent({
      source: "cron",
      message: "new cron failure",
      route: "/api/x",
      status: 500,
      code: "INTERNAL",
      createdAt: base + 1,
    });

    const first = adminErrorsPageSchema.parse(
      await (
        await call("/api/admin/errors?source=cron&limit=1", { as: admin })
      ).json(),
    );
    expect(first.data.map((row) => row.id)).toEqual([newer.id]);
    expect(first.data[0]).toMatchObject({
      source: "cron",
      route: "/api/x",
      status: 500,
      code: "INTERNAL",
      message: "new cron failure",
    });
    expect(first.nextCursor).not.toBeNull();

    const second = adminErrorsPageSchema.parse(
      await (
        await call(
          `/api/admin/errors?source=cron&limit=1&cursor=${first.nextCursor}`,
          { as: admin },
        )
      ).json(),
    );
    expect(second.data[0]?.id).toBe(older.id);
  });

  it("rejects an unknown source", async () => {
    await expectError(
      await call("/api/admin/errors?source=nope", { as: await superadmin() }),
      400,
      "VALIDATION",
    );
  });
});

describe("POST /api/client-errors", () => {
  it("stores source=client with the route stripped of its query string", async () => {
    const route = `/w/abc/lanzar-${crypto.randomUUID()}`;

    const response = await postClientError({
      message: "TypeError: x is undefined",
      stack: "TypeError: x\n at app.js:1",
      route: `${route}?token=abc123&x=1#frag`,
    });

    expect(response.status).toBe(204);
    const [row] = await clientErrorRows(route);
    expect(row).toMatchObject({
      source: "client",
      route,
      message: "TypeError: x is undefined",
      userId: null,
    });
    expect(row?.stackHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("truncates the message to 500 chars and removes tokens", async () => {
    const route = `/truncate-${crypto.randomUUID()}`;
    const message = `Bearer abc.def.ghi access_token=EAAsecret123 ${"x".repeat(900)}`;

    await postClientError({ message, route });

    const [row] = await clientErrorRows(route);
    expect(row!.message.length).toBeLessThanOrEqual(500);
    expect(row!.message).not.toContain("abc.def.ghi");
    expect(row!.message).not.toContain("EAAsecret123");
  });

  it("links the event to the session user when there is one", async () => {
    const route = `/session-${crypto.randomUUID()}`;
    const { owner } = await createWorkspace();

    const response = await call("/api/client-errors", {
      as: owner,
      method: "POST",
      body: { message: "boom", route },
    });

    expect(response.status).toBe(204);
    const [row] = await clientErrorRows(route);
    expect(row?.userId).toBe(owner.id);
  });

  it("rejects an invalid body", async () => {
    await expectError(
      await postClientError({ route: "/x" }),
      400,
      "VALIDATION",
    );
  });

  it("answers 429 on the 21st request in a minute from the same IP", async () => {
    const limiter = countingLimiter(CLIENT_ERROR_LIMIT);
    const send = (ip: string) =>
      postClientError({ message: "boom", route: "/rl" }, { ip, limiter });

    for (let sent = 0; sent < CLIENT_ERROR_LIMIT; sent++) {
      expect((await send("198.51.100.9")).status).toBe(204);
    }

    await expectError(await send("198.51.100.9"), 429, "RATE_LIMITED");
    expect((await send("198.51.100.10")).status).toBe(204);
  });
});
