import { delay, http, HttpResponse, type JsonBodyType } from "msw";
import batchFixture from "../../fixtures/meta/batch.json";
import meFixture from "../../fixtures/meta/me.json";

export const GRAPH_VERSION = "v24.0";
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const graphUrl = (path: string) => `${GRAPH_BASE_URL}/${path}`;

interface ReplyOptions {
  status?: number;
  headers?: Record<string, string>;
}

export const metaReplies = (
  path: string,
  body: JsonBodyType,
  { status = 200, headers = {} }: ReplyOptions = {},
) =>
  http.all(graphUrl(path), () => HttpResponse.json(body, { status, headers }));

export const metaMe = (headers?: Record<string, string>) =>
  metaReplies("me", meFixture, { headers });

export const metaEdgePages = (path: string, pages: JsonBodyType[]) =>
  http.get(graphUrl(path), ({ request }) => {
    const after = new URL(request.url).searchParams.get("after");
    const index = after ? Number(after.replace("cursor_", "")) : 0;
    return HttpResponse.json(pages[index] ?? { data: [] });
  });

export const metaFails = (
  path: string,
  envelope: JsonBodyType,
  status = 400,
  headers?: Record<string, string>,
) => metaReplies(path, envelope, { status, headers });

export const metaBatch = (body: JsonBodyType = batchFixture) =>
  metaReplies("", body);

export const metaHangs = (path: string) =>
  http.all(graphUrl(path), async () => {
    await delay("infinite");
    return HttpResponse.json({});
  });

export const metaNetworkError = (path: string) =>
  http.all(graphUrl(path), () => HttpResponse.error());

export const metaServerError = (path: string, status = 500) =>
  http.all(graphUrl(path), () => new HttpResponse("upstream", { status }));
