import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import * as write from "../../../src/api/integrations/meta/write";
import {
  activateBatch,
  createAd,
  createAdCreative,
  createAdset,
  createCampaign,
  GuardrailError,
  MAX_BATCH_SIZE,
  setDailyBudget,
  setStatus,
} from "../../../src/api/integrations/meta/write";
import { captureRequests, graph, readForm } from "../../helpers/meta-graph";
import { graphUrl, metaReplies } from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const ACCOUNT = "act_1";
const CREATED = { id: "120000000000001" };

const creations = [
  ["createCampaign", createCampaign, "campaigns"],
  ["createAdset", createAdset, "adsets"],
  ["createAd", createAd, "ads"],
  ["createAdCreative", createAdCreative, "adcreatives"],
] as const;

const metaBatchEcho = () =>
  http.post(graphUrl(""), async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    const items = JSON.parse(form.get("batch") ?? "[]") as unknown[];
    return HttpResponse.json(
      items.map(() => ({ code: 200, body: '{"success":true}' })),
    );
  });

const batchItems = async (request: Request) =>
  JSON.parse((await readForm(request)).get("batch") ?? "[]") as {
    method: string;
    relative_url: string;
    body?: string;
  }[];

afterEach(() => {
  server.events.removeAllListeners();
});

describe("creations", () => {
  it.each(creations)(
    "%s rejects ACTIVE without calling Meta",
    async (_name, create, edge) => {
      server.use(metaReplies(`${ACCOUNT}/${edge}`, CREATED));
      const requests = captureRequests();

      await expect(
        create(graph(), ACCOUNT, { name: "X", status: "ACTIVE" }),
      ).rejects.toBeInstanceOf(GuardrailError);
      expect(requests).toHaveLength(0);
    },
  );

  it.each(["DELETED", "ARCHIVED"])(
    "createCampaign rejects %s",
    async (status) => {
      await expect(
        createCampaign(graph(), ACCOUNT, { name: "X", status }),
      ).rejects.toBeInstanceOf(GuardrailError);
    },
  );

  it.each(creations.filter(([, , edge]) => edge !== "adcreatives"))(
    "%s always posts status PAUSED and returns the id",
    async (_name, create, edge) => {
      server.use(metaReplies(`${ACCOUNT}/${edge}`, CREATED));
      const requests = captureRequests();

      const created = await create(graph(), ACCOUNT, { name: "X" });

      expect(created).toEqual(CREATED);
      const [request] = requests;
      expect(request!.method).toBe("POST");
      expect(new URL(request!.url).pathname).toMatch(
        new RegExp(`/${ACCOUNT}/${edge}$`),
      );
      const form = await readForm(request!);
      expect(form.get("status")).toBe("PAUSED");
      expect(form.get("name")).toBe("X");
    },
  );

  it("createAdCreative posts without a status field", async () => {
    server.use(metaReplies(`${ACCOUNT}/adcreatives`, CREATED));
    const requests = captureRequests();

    await createAdCreative(graph(), ACCOUNT, { name: "X", status: "PAUSED" });

    const form = await readForm(requests[0]!);
    expect(form.has("status")).toBe(false);
  });

  it("rejects a response without an id", async () => {
    server.use(metaReplies(`${ACCOUNT}/campaigns`, { success: true }));

    await expect(
      createCampaign(graph(), ACCOUNT, { name: "X" }),
    ).rejects.toThrow("invalid payload");
  });
});

describe("setStatus", () => {
  it.each(["ACTIVE", "PAUSED"] as const)("posts status %s", async (status) => {
    server.use(metaReplies("120000000000001", { success: true }));
    const requests = captureRequests();

    await setStatus(graph(), "120000000000001", status);

    const form = await readForm(requests[0]!);
    expect(requests[0]!.method).toBe("POST");
    expect(form.get("status")).toBe(status);
  });

  it.each(["DELETED", "ARCHIVED", "paused", ""])(
    "rejects %s without calling Meta",
    async (status) => {
      const requests = captureRequests();

      await expect(
        setStatus(graph(), "120000000000001", status as "PAUSED"),
      ).rejects.toBeInstanceOf(GuardrailError);
      expect(requests).toHaveLength(0);
    },
  );
});

describe("setDailyBudget", () => {
  it("posts daily_budget in minor units", async () => {
    server.use(metaReplies("120000000000001", { success: true }));
    const requests = captureRequests();

    await setDailyBudget(graph(), "120000000000001", 15000);

    const form = await readForm(requests[0]!);
    expect(form.get("daily_budget")).toBe("15000");
    expect([...form.keys()].sort()).toEqual([
      "appsecret_proof",
      "daily_budget",
    ]);
  });

  it.each([0, -100, 10.5, Number.NaN])(
    "rejects %s without calling Meta",
    async (minor) => {
      const requests = captureRequests();

      await expect(
        setDailyBudget(graph(), "120000000000001", minor),
      ).rejects.toBeInstanceOf(GuardrailError);
      expect(requests).toHaveLength(0);
    },
  );
});

describe("activateBatch", () => {
  it("activates every object with status ACTIVE and start_time only on adsets", async () => {
    server.use(metaBatchEcho());
    const requests = captureRequests();
    const startAt = "2026-12-01T03:00:00.000Z";

    const results = await activateBatch(
      graph(),
      [
        { id: "1", kind: "campaign" },
        { id: "2", kind: "adset" },
        { id: "3", kind: "ad" },
      ],
      startAt,
    );

    expect(results.every((result) => result.ok)).toBe(true);
    const items = await batchItems(requests[0]!);
    expect(
      items.map(({ method, relative_url }) => [method, relative_url]),
    ).toEqual([
      ["POST", "1"],
      ["POST", "2"],
      ["POST", "3"],
    ]);
    const bodies = items.map(({ body }) => new URLSearchParams(body));
    expect(bodies.map((body) => body.get("status"))).toEqual([
      "ACTIVE",
      "ACTIVE",
      "ACTIVE",
    ]);
    expect(bodies.map((body) => body.get("start_time"))).toEqual([
      null,
      startAt,
      null,
    ]);
  });

  it(`sends at most ${MAX_BATCH_SIZE} objects per Meta call, in order`, async () => {
    server.use(metaBatchEcho());
    const requests = captureRequests();
    const objects = Array.from({ length: 120 }, (_, index) => ({
      id: String(index + 1),
      kind: "ad" as const,
    }));

    const results = await activateBatch(graph(), objects);

    expect(MAX_BATCH_SIZE).toBe(50);
    expect(results).toHaveLength(120);
    const batches = await Promise.all(requests.map(batchItems));
    expect(batches.map((items) => items.length)).toEqual([50, 50, 20]);
    expect(batches[2]!.at(-1)!.relative_url).toBe("120");
  });

  it("makes no call for an empty list", async () => {
    const requests = captureRequests();

    expect(await activateBatch(graph(), [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});

describe("module surface", () => {
  it("exports nothing to delete or upload", () => {
    const names = Object.keys(write);

    expect(names.filter((name) => /delete|remove|archive/i.test(name))).toEqual(
      [],
    );
    expect(names.filter((name) => /upload|image|video/i.test(name))).toEqual(
      [],
    );
  });
});
