import { http, HttpResponse } from "msw";
import { GRAPH_BASE_URL } from "../../helpers/msw/meta";
import { landingResponds } from "../../helpers/msw/landing";

export const LANDING_URL = "https://tienda.example.test/producto";

type Posts = URLSearchParams[];
type Json = Record<string, unknown>;

export interface FakeEdges {
  campaigns: Posts;
  adsets: Posts;
  adcreatives: Posts;
  ads: Posts;
}

export type VerifyPatch = (path: string, body: Json) => Json;

const json = (form: URLSearchParams | undefined, key: string) => {
  const value = form?.get(key);
  return value ? JSON.parse(value) : undefined;
};

const numberOf = (form: URLSearchParams | undefined, key: string) => {
  const value = form?.get(key);
  return value ? Number(value) : undefined;
};

const findPost = (posts: Posts, edge: string, id: string) =>
  posts[Number(id.slice(edge.length + 1)) - 1];

function campaignOf(form: URLSearchParams | undefined): Json {
  return {
    status: form?.get("status"),
    daily_budget: form?.get("daily_budget"),
    bid_strategy: form?.get("bid_strategy"),
  };
}

function adsetOf(form: URLSearchParams | undefined): Json {
  return {
    status: form?.get("status"),
    optimization_goal: form?.get("optimization_goal"),
    promoted_object: json(form, "promoted_object"),
    targeting: json(form, "targeting"),
    bid_amount: numberOf(form, "bid_amount"),
  };
}

function adOf(edges: FakeEdges, form: URLSearchParams): Json {
  const creativeId = json(form, "creative").creative_id as string;
  const creative = findPost(edges.adcreatives, "adcreatives", creativeId);
  const storyId = creative?.get("object_story_id");
  return {
    status: form.get("status"),
    creative: {
      object_story_spec: json(creative, "object_story_spec"),
      effective_object_story_id: storyId ?? `page-1_${creativeId}`,
      degrees_of_freedom_spec: json(creative, "degrees_of_freedom_spec"),
    },
  };
}

function bodyFor(edges: FakeEdges, path: string): Json {
  if (path.endsWith("/ads")) {
    return { data: edges.ads.map((form) => adOf(edges, form)) };
  }
  if (path.startsWith("campaigns-")) {
    return campaignOf(findPost(edges.campaigns, "campaigns", path));
  }
  if (path.startsWith("adsets-")) {
    return adsetOf(findPost(edges.adsets, "adsets", path));
  }
  return { id: path, status: { video_status: "ready" } };
}

export function fakeVerify(edges: FakeEdges, patch: VerifyPatch = (_, b) => b) {
  return [
    http.post(`${GRAPH_BASE_URL}/`, async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      const batch = JSON.parse(form.get("batch") ?? "[]") as {
        relative_url: string;
      }[];
      return HttpResponse.json(
        batch.map(({ relative_url }) => {
          const path = relative_url.split("?")[0]!;
          return {
            code: 200,
            headers: [],
            body: JSON.stringify(patch(path, bodyFor(edges, path))),
          };
        }),
      );
    }),
    landingResponds(LANDING_URL, 200),
  ];
}
