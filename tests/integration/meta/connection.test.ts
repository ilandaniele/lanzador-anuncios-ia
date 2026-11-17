import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../../../src/api/lib/errors";
import { MetaError } from "../../../src/api/integrations/meta/client";
import type { Scope } from "../../../src/api/repositories/scope";
import {
  getGraphForAsset,
  graphForConnection,
  markReconnectRequired,
} from "../../../src/api/services/meta/connection";
import { metaConnections } from "../../../src/db/schema/meta";
import sessionFixture from "../../fixtures/meta/error-session.json";
import {
  createMetaAsset,
  createMetaConnection,
  createWorkspace,
} from "../../helpers/factory";
import { GRAPH_VERSION, metaFails, metaMe } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const TOKEN = "EAABconnectionTestToken456";
const keyEnv = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};
const graphEnv = {
  ...keyEnv,
  GRAPH_API_VERSION: GRAPH_VERSION,
  META_APP_SECRET: "test-app-secret",
};

const scopeFor = (workspaceId: string, userId: string): Scope => ({
  workspaceId,
  userId,
  role: "editor",
});

async function connectedWorkspace() {
  const { workspace, owner } = await createWorkspace();
  const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN);
  const asset = await createMetaAsset(workspace.id, connection.id);
  return { workspace, owner, connection, asset };
}

const readConnection = async (id: string) => {
  const [row] = await drizzle(env.DB)
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.id, id));
  return row!;
};

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject");
};

afterEach(() => {
  server.events.removeAllListeners();
});

describe("graphForConnection", () => {
  it("leaves the connection in reconnect_required after a 190", async () => {
    const { workspace, connection } = await connectedWorkspace();
    server.use(metaFails("me", sessionFixture));
    const graph = graphForConnection(env.DB, graphEnv, {
      token: TOKEN,
      connectionId: connection.id,
      workspaceId: workspace.id,
    });

    const error = await rejection(graph.get("me"));

    expect(error).toBeInstanceOf(MetaError);
    const row = await readConnection(connection.id);
    expect(row.status).toBe("reconnect_required");
    expect(row.lastErrorCode).toBe(190);
    expect(row.lastErrorAt).toEqual(expect.any(Number));
  });

  it("keeps the connection active on non-session errors", async () => {
    const { workspace, connection } = await connectedWorkspace();
    server.use(metaFails("me", { error: { code: 100, message: "bad" } }));
    const graph = graphForConnection(env.DB, graphEnv, {
      token: TOKEN,
      connectionId: connection.id,
      workspaceId: workspace.id,
    });

    await rejection(graph.get("me"));

    expect((await readConnection(connection.id)).status).toBe("active");
  });
});

describe("markReconnectRequired", () => {
  it("leaves a connection of another workspace untouched", async () => {
    const { connection } = await connectedWorkspace();
    const other = await createWorkspace();

    await markReconnectRequired(env.DB, other.workspace.id, connection.id, 190);

    const row = await readConnection(connection.id);
    expect(row.status).toBe("active");
    expect(row.lastErrorCode).toBeNull();
  });

  it("only updates active connections", async () => {
    const { workspace } = await createWorkspace();
    const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN, {
      status: "reconnect_required",
      lastErrorCode: 190,
    });

    await markReconnectRequired(env.DB, workspace.id, connection.id, 463);

    expect((await readConnection(connection.id)).lastErrorCode).toBe(190);
  });
});

describe("getGraphForAsset", () => {
  it("returns the asset and a graph using the decrypted token", async () => {
    const { workspace, owner, asset } = await connectedWorkspace();
    server.use(metaMe());
    const requests: Request[] = [];
    server.events.on("request:start", ({ request }) => {
      requests.push(request.clone());
    });

    const result = await getGraphForAsset(
      env.DB,
      graphEnv,
      scopeFor(workspace.id, owner.id),
      asset.id,
    );
    await result.graph.get("me");

    expect(result.asset).toMatchObject({ id: asset.id, metaId: asset.metaId });
    expect(requests[0]!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("returns 404 for an asset of another workspace", async () => {
    const { asset } = await connectedWorkspace();
    const other = await createWorkspace();

    const error = await rejection(
      getGraphForAsset(
        env.DB,
        graphEnv,
        scopeFor(other.workspace.id, other.owner.id),
        asset.id,
      ),
    );

    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it.each([
    ["disabled", { enabled: 0 }],
    ["not an ad account", { kind: "page" }],
  ])("returns 404 for an asset that is %s", async (_label, overrides) => {
    const { workspace, owner, connection } = await connectedWorkspace();
    const asset = await createMetaAsset(workspace.id, connection.id, overrides);

    const error = await rejection(
      getGraphForAsset(
        env.DB,
        graphEnv,
        scopeFor(workspace.id, owner.id),
        asset.id,
      ),
    );

    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("returns 409 META_RECONNECT_REQUIRED when the connection needs reconnecting", async () => {
    const { workspace, owner } = await createWorkspace();
    const connection = await createMetaConnection(keyEnv, workspace.id, TOKEN, {
      status: "reconnect_required",
    });
    const asset = await createMetaAsset(workspace.id, connection.id);

    const error = await rejection(
      getGraphForAsset(
        env.DB,
        graphEnv,
        scopeFor(workspace.id, owner.id),
        asset.id,
      ),
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 409,
      code: "META_RECONNECT_REQUIRED",
    });
  });
});
