import {
  createGraph,
  type GraphOptions,
  MetaError,
} from "../../src/api/integrations/meta/client";
import { bytesToHex, hmacSha256 } from "../../src/api/lib/hash";
import { GRAPH_VERSION } from "./msw/meta";
import { server } from "./msw/server";

export const TOKEN = "EAABtestSystemUserToken123";
const APP_SECRET = "test-app-secret";
const env = { GRAPH_API_VERSION: GRAPH_VERSION, META_APP_SECRET: APP_SECRET };
const conn = { token: TOKEN, connectionId: "conn_1", workspaceId: "ws_1" };

export const graph = (options?: GraphOptions) =>
  createGraph(env, conn, options);

export const expectedProof = async () =>
  bytesToHex(await hmacSha256(APP_SECRET, TOKEN));

export const captureRequests = () => {
  const requests: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
};

export const readForm = async (request: Request) =>
  new URLSearchParams(new TextDecoder().decode(await request.arrayBuffer()));

export const rejection = async (
  promise: Promise<unknown>,
): Promise<MetaError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof MetaError) return error;
    throw error;
  }
  throw new Error("expected promise to reject");
};

export const envelope = (error: Record<string, unknown>) => ({
  error: { message: "Graph error", type: "OAuthException", ...error },
});
