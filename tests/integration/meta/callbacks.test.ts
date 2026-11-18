import { introspectWorkflow } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/api/app";
import { metaAssets, metaConnections } from "../../../src/db/schema/meta";
import { auditLog, dataDeletionRequests } from "../../../src/db/schema/ops";
import { insightsCache } from "../../../src/db/schema/pilot";
import type { JobContext } from "../../../src/workflows/jobs/job-context";
import { metaDisconnectCleanupJob } from "../../../src/workflows/jobs/meta-disconnect-cleanup";
import {
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
  expectError,
} from "../../helpers/factory";
import {
  META_TEST_APP_SECRET,
  signedRequestFor,
  signRequest,
} from "../../helpers/signed-request";
import { ORIGIN, openLimiter, testEnv } from "../pipeline/helpers";

const app = createApp();
const db = drizzle(env.DB);

const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

const routeEnv = testEnv({
  ...keyEnv,
  META_APP_SECRET: META_TEST_APP_SECRET,
  RL_IP: openLimiter,
  RL_AUTH: openLimiter,
});

const postSigned = (path: string, signedRequest: string) =>
  app.request(
    path,
    {
      method: "POST",
      body: new URLSearchParams({ signed_request: signedRequest }),
    },
    routeEnv,
  );

const getStatus = (code: string) =>
  app.request(`/api/meta/data-deletion/${code}`, {}, routeEnv);

const newMetaUserId = () => String(Math.floor(Math.random() * 1e15) + 1e15);

async function insertInsights(workspaceId: string, adAccountAssetId: string) {
  const at = Date.now();
  await db.insert(insightsCache).values({
    id: crypto.randomUUID(),
    workspaceId,
    adAccountAssetId,
    level: "campaign",
    rangeKey: "today",
    dateFrom: "2026-11-17",
    dateTo: "2026-11-17",
    payload: "[]",
    fetchedAt: at,
    expiresAt: at + 60_000,
  });
}

async function connectWorkspace(metaUserId: string) {
  const { workspace } = await createWorkspace();
  const connection = await createMetaConnection(
    keyEnv,
    workspace.id,
    "EAABcallbacksToken",
    { metaUserId },
  );
  const asset = await createMetaAsset(workspace.id, connection.id);
  await insertInsights(workspace.id, asset.id);
  return { workspaceId: workspace.id, connection };
}

const connectionStatus = async (id: string) => {
  const [row] = await db
    .select({ status: metaConnections.status })
    .from(metaConnections)
    .where(eq(metaConnections.id, id));
  return row?.status;
};

const workspaceData = async (workspaceId: string) => ({
  connections: await db
    .select({ id: metaConnections.id })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId)),
  assets: await db
    .select({ id: metaAssets.id })
    .from(metaAssets)
    .where(eq(metaAssets.workspaceId, workspaceId)),
  insights: await db
    .select({ id: insightsCache.id })
    .from(insightsCache)
    .where(eq(insightsCache.workspaceId, workspaceId)),
});

const NO_DATA = { connections: [], assets: [], insights: [] };

const deletionRequest = async (confirmationCode: string) => {
  const [row] = await db
    .select()
    .from(dataDeletionRequests)
    .where(eq(dataDeletionRequests.confirmationCode, confirmationCode));
  return row;
};

const deauthorizedAudits = (workspaceId: string) =>
  db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.workspaceId, workspaceId),
        eq(auditLog.action, "meta.deauthorized"),
      ),
    );

const inlineStep = {
  do: (_name: string, _config: unknown, run: () => Promise<unknown>) => run(),
} as unknown as JobContext["step"];

const runCleanup = (requestId: string) =>
  metaDisconnectCleanupJob({
    env: routeEnv,
    step: inlineStep,
    key: requestId,
    workspaceId: null,
    payload: { requestId },
  });

async function insertDeletionRequest(metaUserId: string) {
  const request = {
    id: crypto.randomUUID(),
    confirmationCode: crypto.randomUUID().slice(0, 16),
    metaUserId,
    createdAt: Date.now(),
  };
  await db.insert(dataDeletionRequests).values(request);
  return request;
}

describe.each(["/api/meta/deauthorize", "/api/meta/data-deletion"])(
  "POST %s signature checks",
  (path) => {
    it("rejects a bad signature with 400 BAD_SIGNATURE", async () => {
      const metaUserId = newMetaUserId();
      const { connection } = await connectWorkspace(metaUserId);

      const response = await postSigned(
        path,
        await signedRequestFor(metaUserId, "wrong-secret"),
      );

      await expectError(response, 400, "BAD_SIGNATURE");
      expect(await connectionStatus(connection.id)).toBe("active");
    });

    it("rejects a wrong algorithm", async () => {
      const response = await postSigned(
        path,
        await signRequest({ algorithm: "HMAC-SHA1", user_id: "1" }),
      );

      await expectError(response, 400, "BAD_SIGNATURE");
    });

    it.each(["", "garbage", "a.b.c"])(
      "rejects malformed signed_request %j",
      async (value) => {
        await expectError(await postSigned(path, value), 400, "BAD_SIGNATURE");
      },
    );

    it("rejects a JSON body without signed_request", async () => {
      const response = await app.request(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "1" }),
        },
        routeEnv,
      );

      await expectError(response, 400, "BAD_SIGNATURE");
    });
  },
);

describe("POST /api/meta/deauthorize", () => {
  it("marks every connection of the Meta user reconnect_required and audits, without CSRF headers", async () => {
    const metaUserId = newMetaUserId();
    const first = await connectWorkspace(metaUserId);
    const second = await connectWorkspace(metaUserId);
    const other = await connectWorkspace(newMetaUserId());

    const response = await postSigned(
      "/api/meta/deauthorize",
      await signedRequestFor(metaUserId),
    );

    expect(response.status).toBe(200);
    expect(await connectionStatus(first.connection.id)).toBe(
      "reconnect_required",
    );
    expect(await connectionStatus(second.connection.id)).toBe(
      "reconnect_required",
    );
    expect(await connectionStatus(other.connection.id)).toBe("active");
    const audits = await deauthorizedAudits(first.workspaceId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: null,
      actorType: "system",
      origin: "system",
      objectType: "meta_connection",
      result: "ok",
    });
    expect(JSON.parse(audits[0]!.detail!)).toEqual({
      connectionId: first.connection.id,
    });
    expect(await deauthorizedAudits(second.workspaceId)).toHaveLength(1);
    expect(await deauthorizedAudits(other.workspaceId)).toHaveLength(0);
  });

  it("audits only once when Meta repeats the callback", async () => {
    const metaUserId = newMetaUserId();
    const { workspaceId } = await connectWorkspace(metaUserId);
    const signed = await signedRequestFor(metaUserId);

    await postSigned("/api/meta/deauthorize", signed);
    const repeated = await postSigned("/api/meta/deauthorize", signed);

    expect(repeated.status).toBe(200);
    expect(await deauthorizedAudits(workspaceId)).toHaveLength(1);
  });

  it("answers 200 for a Meta user without connections", async () => {
    const response = await postSigned(
      "/api/meta/deauthorize",
      await signedRequestFor(newMetaUserId()),
    );

    expect(response.status).toBe(200);
  });
});

describe("POST /api/meta/data-deletion", () => {
  it("creates a request, runs the cleanup job and returns url and code", async () => {
    await using introspector = await introspectWorkflow(env.JOB_WF!);
    const metaUserId = newMetaUserId();
    const first = await connectWorkspace(metaUserId);
    const second = await connectWorkspace(metaUserId);
    const other = await connectWorkspace(newMetaUserId());

    const response = await postSigned(
      "/api/meta/data-deletion",
      await signedRequestFor(metaUserId),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      url: string;
      confirmation_code: string;
    };
    expect(body.confirmation_code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(body.url).toBe(
      `${ORIGIN}/api/meta/data-deletion/${body.confirmation_code}`,
    );
    expect(await deletionRequest(body.confirmation_code)).toMatchObject({
      metaUserId,
    });

    const instances = await introspector.get();
    expect(instances).toHaveLength(1);
    await instances[0]!.waitForStatus("complete");

    expect(await workspaceData(first.workspaceId)).toEqual(NO_DATA);
    expect(await workspaceData(second.workspaceId)).toEqual(NO_DATA);
    const untouched = await workspaceData(other.workspaceId);
    expect(untouched.connections).toHaveLength(1);
    expect(untouched.assets).toHaveLength(1);
    expect(untouched.insights).toHaveLength(1);
    expect(await deletionRequest(body.confirmation_code)).toMatchObject({
      status: "done",
      connectionsAffected: 2,
    });
  });

  it("returns a different code for each request", async () => {
    await using introspector = await introspectWorkflow(env.JOB_WF!);
    const signed = await signedRequestFor(newMetaUserId());

    const confirmationCode = async () => {
      const response = await postSigned("/api/meta/data-deletion", signed);
      const body = (await response.json()) as { confirmation_code: string };
      return body.confirmation_code;
    };
    const codes = [await confirmationCode(), await confirmationCode()];

    expect(new Set(codes).size).toBe(2);
    for (const instance of await introspector.get()) {
      await instance.waitForStatus("complete");
    }
  });
});

describe("GET /api/meta/data-deletion/:code", () => {
  it("returns only status and dates of a received request", async () => {
    const request = await insertDeletionRequest(newMetaUserId());

    const response = await getStatus(request.confirmationCode);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "received",
      receivedAt: new Date(request.createdAt).toISOString(),
      completedAt: null,
    });
  });

  it("reports done after the cleanup", async () => {
    const request = await insertDeletionRequest(newMetaUserId());
    await runCleanup(request.id);

    const response = await getStatus(request.confirmationCode);
    const body = (await response.json()) as {
      status: string;
      completedAt: string | null;
    };

    expect(body.status).toBe("done");
    expect(body.completedAt).not.toBeNull();
  });

  it.each(["AAAAAAAAAAAAAAAA", "short", "x".repeat(200)])(
    "answers 404 for unknown code %s",
    async (code) => {
      await expectError(await getStatus(code), 404, "NOT_FOUND");
    },
  );
});

describe("meta_disconnect_cleanup job", () => {
  it("deletes connections, assets and insights of the Meta user only", async () => {
    const metaUserId = newMetaUserId();
    const target = await connectWorkspace(metaUserId);
    const other = await connectWorkspace(newMetaUserId());
    const request = await insertDeletionRequest(metaUserId);

    await runCleanup(request.id);

    expect(await workspaceData(target.workspaceId)).toEqual(NO_DATA);
    const untouched = await workspaceData(other.workspaceId);
    expect(untouched.connections).toHaveLength(1);
    expect(await deletionRequest(request.confirmationCode)).toMatchObject({
      status: "done",
      connectionsAffected: 1,
    });
  });

  it("keeps the first result when it runs again", async () => {
    const metaUserId = newMetaUserId();
    await connectWorkspace(metaUserId);
    const request = await insertDeletionRequest(metaUserId);
    await runCleanup(request.id);
    const done = await deletionRequest(request.confirmationCode);

    await runCleanup(request.id);

    expect(await deletionRequest(request.confirmationCode)).toEqual(done);
  });

  it("fails without retries for an unknown request", async () => {
    await expect(runCleanup(crypto.randomUUID())).rejects.toThrow(
      "Unknown data deletion request",
    );
  });

  it("fails without retries for an invalid payload", async () => {
    await expect(
      metaDisconnectCleanupJob({
        env: routeEnv,
        step: inlineStep,
        key: "invalid",
        workspaceId: null,
        payload: {},
      }),
    ).rejects.toThrow("Invalid meta_disconnect_cleanup job");
  });
});
