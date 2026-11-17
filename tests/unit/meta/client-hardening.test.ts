import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetaError } from "../../../src/api/integrations/meta/client";
import { readUsage } from "../../../src/api/integrations/meta/usage";
import rateLimitFixture from "../../fixtures/meta/error-rate-limit.json";
import sessionFixture from "../../fixtures/meta/error-session.json";
import meFixture from "../../fixtures/meta/me.json";
import usageHigh from "../../fixtures/meta/usage-high.json";
import {
  captureRequests,
  envelope,
  graph,
  readForm,
  rejection,
  TOKEN,
} from "../../helpers/meta-graph";
import {
  metaBatch,
  metaFails,
  metaMe,
  metaReplies,
  metaServerError,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

const pagedPayload = {
  data: [{ id: "1" }],
  paging: {
    cursors: { before: "b1", after: "a1" },
    next: `https://graph.facebook.com/v24.0/act_1/ads?access_token=${TOKEN}`,
    previous: "https://graph.facebook.com/v24.0/act_1/ads?before=b1",
  },
};

const strippedPayload = {
  data: [{ id: "1" }],
  paging: { cursors: { before: "b1", after: "a1" } },
};

const usageHeaderItem = (code: number, body: unknown) => ({
  code,
  headers: [
    {
      name: "X-Business-Use-Case-Usage",
      value: usageHigh["X-Business-Use-Case-Usage"],
    },
  ],
  body: JSON.stringify(body),
});

const failingBody = () =>
  new Response(
    new ReadableStream({
      start: (controller) => controller.error(new Error("stream broke")),
    }),
  );

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe("createGraph path validation", () => {
  it.each([
    "act_1/../me",
    "../me",
    "./me",
    "me?method=delete",
    "act_1//ads",
    "act_1/ads/",
    "https://evil.test/me",
    "",
  ])("rejects %j without fetching", async (path) => {
    const requests = captureRequests();
    const client = graph();

    const errors = await Promise.all([
      rejection(client.get(path)),
      rejection(client.post(path, {})),
      rejection(client.batch([{ method: "GET", path }])),
    ]);

    expect(errors.map(({ kind }) => kind)).toEqual(["param", "param", "param"]);
    expect(requests).toHaveLength(0);
    expect(client.callCount()).toBe(0);
  });

  it("sends batch query params through relative_url", async () => {
    server.use(metaBatch([{ code: 200, body: "{}" }]));
    const requests = captureRequests();

    await graph().batch([
      { method: "GET", path: "act_1/ads", query: { method: "delete" } },
    ]);

    const form = await readForm(requests[0]!);
    expect(JSON.parse(form.get("batch")!)).toEqual([
      { method: "GET", relative_url: "act_1/ads?method=delete" },
    ]);
  });
});

describe("createGraph response hardening", () => {
  it("does not follow redirects", async () => {
    server.use(
      metaReplies("me", null, {
        status: 302,
        headers: { Location: "https://evil.test/collect" },
      }),
    );
    const requests = captureRequests();

    const error = await rejection(graph().get("me"));

    expect(error.code).toBe(302);
    expect(requests.map(({ url }) => new URL(url).host)).toEqual([
      "graph.facebook.com",
    ]);
  });

  it("turns a body read failure into a transient error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failingBody());

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({ kind: "transient", code: 0 });
  });

  it("turns a 2xx without JSON into a transient error", async () => {
    server.use(metaServerError("me", 200));

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({ kind: "transient", code: 0 });
  });

  it("strips paging.next and paging.previous but keeps cursors", async () => {
    server.use(metaReplies("act_1/ads", pagedPayload));

    await expect(graph().get("act_1/ads")).resolves.toEqual(strippedPayload);
  });

  it("strips paging links from batch item bodies", async () => {
    server.use(metaBatch([{ code: 200, body: JSON.stringify(pagedPayload) }]));

    const [result] = await graph().batch([
      { method: "GET", path: "act_1/ads" },
    ]);

    expect(result).toEqual({ ok: true, data: strippedPayload });
  });

  it("caps and scrubs Graph error strings and ignores mistyped fields", async () => {
    server.use(
      metaFails("me", {
        error: {
          code: "190",
          error_subcode: "460",
          message: `failed for https://x.test/cb?access_token=${TOKEN}`,
          error_user_title: { nested: true },
          error_user_msg: "x".repeat(2_000),
        },
      }),
    );

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({ kind: "param", code: 400 });
    expect(error.subcode).toBeUndefined();
    expect(error.message).not.toContain(TOKEN);
    expect(error.userTitle).toBeUndefined();
    expect(error.userMsg).toHaveLength(500);
  });
});

describe("createGraph batch hardening", () => {
  it.each([
    ["an object", { error: "nope" }],
    ["a shorter array", [{ code: 200, body: "{}" }]],
  ])("rejects a batch reply that is %s as transient", async (_label, body) => {
    server.use(metaBatch(body));

    const error = await rejection(
      graph().batch([
        { method: "GET", path: "a" },
        { method: "GET", path: "b" },
      ]),
    );

    expect(error).toMatchObject({ kind: "transient", code: 0 });
  });

  it("throttles when a batch item's usage headers reach 75 %", async () => {
    server.use(metaBatch([usageHeaderItem(200, { id: "1" })]), metaMe());
    const client = graph();

    const [result] = await client.batch([{ method: "GET", path: "a" }]);
    const error = await rejection(client.get("me"));

    expect(result).toEqual({ ok: true, data: { id: "1" } });
    expect(error).toMatchObject({ kind: "rate_limit", retryAfterMs: 300_000 });
  });

  it("throttles when a batch item fails with a rate limit", async () => {
    server.use(
      metaBatch([{ code: 400, body: JSON.stringify(rateLimitFixture) }]),
      metaMe(),
    );
    const requests = captureRequests();
    const client = graph();

    await client.batch([{ method: "GET", path: "a" }]);
    const error = await rejection(client.get("me"));

    expect(error).toMatchObject({ kind: "rate_limit", retryAfterMs: 60_000 });
    expect(requests).toHaveLength(1);
  });
});

describe("createGraph throttle and session hook", () => {
  it("re-checks the throttle after awaiting the proof", async () => {
    const client = graph();
    let concurrent: Promise<MetaError> | undefined;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        const response = Response.json(meFixture, { headers: usageHigh });
        const headers = response.headers;
        Object.defineProperty(response, "headers", {
          get: () => {
            concurrent ??= rejection(client.get("me"));
            return headers;
          },
        });
        return response;
      });

    await client.get("me");
    const error = await concurrent!;

    expect(error.kind).toBe("rate_limit");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the original MetaError when onSessionError throws", async () => {
    server.use(metaFails("me", sessionFixture));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const onSessionError = vi.fn(async () => {
      throw new Error("db down");
    });

    const error = await rejection(graph({ onSessionError }).get("me"));

    expect(error).toMatchObject({ kind: "session", code: 190 });
    expect(log.mock.calls.flat().join("\n")).toContain(
      "meta.session_hook_failed",
    );
  });

  it("does not report a non-session batch failure", async () => {
    server.use(
      metaBatch([{ code: 400, body: JSON.stringify(envelope({ code: 100 })) }]),
    );
    const onSessionError = vi.fn(async () => undefined);

    await graph({ onSessionError }).batch([{ method: "GET", path: "a" }]);

    expect(onSessionError).not.toHaveBeenCalled();
  });
});

describe("readUsage", () => {
  it("accepts numeric strings", () => {
    const headers = new Headers({
      "x-app-usage": JSON.stringify({ call_count: "80", total_time: "x" }),
    });

    expect(readUsage(headers)).toEqual({ maxPercent: 80 });
  });
});
