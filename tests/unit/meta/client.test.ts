import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BATCH_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from "../../../src/api/integrations/meta/client";
import paramFixture from "../../fixtures/meta/error-param.json";
import rateLimitFixture from "../../fixtures/meta/error-rate-limit.json";
import sessionFixture from "../../fixtures/meta/error-session.json";
import meFixture from "../../fixtures/meta/me.json";
import usageHigh from "../../fixtures/meta/usage-high.json";
import usageLow from "../../fixtures/meta/usage-low.json";
import {
  captureRequests,
  envelope,
  expectedProof,
  graph,
  readForm,
  rejection,
  TOKEN,
} from "../../helpers/meta-graph";
import {
  metaBatch,
  metaFails,
  metaHangs,
  metaMe,
  metaNetworkError,
  metaReplies,
  metaServerError,
} from "../../helpers/msw/meta";
import { server } from "../../helpers/msw/server";

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe("createGraph requests", () => {
  it("authenticates with a Bearer header and appsecret_proof, never the URL", async () => {
    server.use(metaMe());
    const requests = captureRequests();

    const me = await graph().get("me", { fields: "id,name" });

    expect(me).toEqual(meFixture);
    const [request] = requests;
    const url = new URL(request!.url);
    expect(request!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(url.searchParams.get("appsecret_proof")).toBe(await expectedProof());
    expect(url.searchParams.get("fields")).toBe("id,name");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(request!.url).not.toContain(TOKEN);
  });

  it("posts form fields with appsecret_proof in the body and no token", async () => {
    server.use(metaReplies("act_1/campaigns", { id: "120000000000001" }));
    const requests = captureRequests();

    await graph().post("act_1/campaigns", {
      name: "Campaña",
      status: "PAUSED",
      special_ad_categories: [],
    });

    const [request] = requests;
    const form = await readForm(request!);
    expect(request!.method).toBe("POST");
    expect(request!.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(form.get("name")).toBe("Campaña");
    expect(form.get("special_ad_categories")).toBe("[]");
    expect(form.get("appsecret_proof")).toBe(await expectedProof());
    expect(form.has("access_token")).toBe(false);
    expect(request!.url).not.toContain(TOKEN);
    expect(request!.url).not.toContain("appsecret_proof");
  });

  it("uses a 30 s timeout per request and 60 s per batch", async () => {
    server.use(metaMe(), metaBatch([{ code: 200, body: "{}" }]));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const client = graph();

    await client.get("me");
    await client.batch([{ method: "GET", path: "me" }]);

    expect(timeout.mock.calls).toEqual([
      [REQUEST_TIMEOUT_MS],
      [BATCH_TIMEOUT_MS],
    ]);
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(BATCH_TIMEOUT_MS).toBe(60_000);
  });

  it("turns a timeout into a transient error", async () => {
    server.use(metaHangs("me"));
    const shortTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => shortTimeout(5));

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({ kind: "transient", code: 0 });
    expect(error.message).toBe("Meta request timed out");
  });

  it("turns a network failure into a transient error", async () => {
    server.use(metaNetworkError("me"));

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({ kind: "transient", code: 0 });
  });
});

describe("createGraph error classification (TRD §6.3)", () => {
  it.each([
    ["code 4", 400, { code: 4 }, "rate_limit"],
    ["code 17", 400, { code: 17 }, "rate_limit"],
    ["code 32", 400, { code: 32 }, "rate_limit"],
    ["code 613", 400, { code: 613 }, "rate_limit"],
    ["code 80000", 400, { code: 80000 }, "rate_limit"],
    ["code 80004", 400, { code: 80004 }, "rate_limit"],
    ["code 80014", 400, { code: 80014 }, "rate_limit"],
    ["is_transient", 500, { code: 2, is_transient: true }, "rate_limit"],
    ["code 190", 400, { code: 190 }, "session"],
    ["subcode 458", 400, { code: 102, error_subcode: 458 }, "session"],
    ["subcode 460", 400, { code: 102, error_subcode: 460 }, "session"],
    ["subcode 463", 400, { code: 102, error_subcode: 463 }, "session"],
    ["subcode 467", 400, { code: 102, error_subcode: 467 }, "session"],
    [
      "API access blocked",
      400,
      { code: 200, message: "(#200) API access blocked." },
      "session",
    ],
    [
      "API access blocked with a non-200 code",
      400,
      { code: 100, message: "(#100) API access blocked." },
      "param",
    ],
    ["code 10", 403, { code: 10 }, "permission"],
    ["code 200", 403, { code: 200 }, "permission"],
    ["code 250", 403, { code: 250 }, "permission"],
    ["code 299", 403, { code: 299 }, "permission"],
    ["code 100", 400, { code: 100 }, "param"],
    ["subcode 1487xxx", 500, { code: 1, error_subcode: 1487390 }, "param"],
    ["subcode 2446xxx", 500, { code: 1, error_subcode: 2446289 }, "param"],
    ["subcode 1885xxx", 500, { code: 1, error_subcode: 1885183 }, "param"],
    ["code 1487xxx", 500, { code: 1487007 }, "param"],
    ["code 80015 is not a rate limit", 400, { code: 80015 }, "param"],
    ["code 300 is not a permission", 400, { code: 300 }, "param"],
    ["unknown 5xx", 503, { code: 1 }, "transient"],
  ] as const)("%s → %s", async (_label, status, error, kind) => {
    server.use(metaFails("me", envelope(error), status));

    const thrown = await rejection(graph().get("me"));

    expect(thrown.kind).toBe(kind);
    expect(thrown.code).toBe(error.code);
    expect(thrown.subcode).toBe(
      "error_subcode" in error ? error.error_subcode : undefined,
    );
  });

  it("classifies a 5xx without a Graph envelope as transient", async () => {
    server.use(metaServerError("me", 502));

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({ kind: "transient", code: 502 });
  });

  it("carries error_user_title and error_user_msg on param errors", async () => {
    server.use(metaFails("act_1/adcreatives", paramFixture));

    const error = await rejection(graph().post("act_1/adcreatives", {}));

    expect(error).toMatchObject({
      kind: "param",
      code: 100,
      subcode: 1487390,
      userTitle: paramFixture.error.error_user_title,
      userMsg: paramFixture.error.error_user_msg,
    });
  });

  it("uses estimated_time_to_regain_access as retryAfterMs", async () => {
    server.use(metaFails("me", rateLimitFixture, 400, usageHigh));

    const error = await rejection(graph().get("me"));

    expect(error).toMatchObject({
      kind: "rate_limit",
      code: 80004,
      retryAfterMs: 5 * 60_000,
    });
  });
});

describe("createGraph usage headers", () => {
  it("stops calling Meta once usage reaches 75 %", async () => {
    server.use(metaMe(usageHigh));
    const requests = captureRequests();
    const client = graph();

    await expect(client.get("me")).resolves.toEqual(meFixture);
    const error = await rejection(client.get("me"));

    expect(error).toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 5 * 60_000,
    });
    expect(requests).toHaveLength(1);
    expect(client.callCount()).toBe(1);
  });

  it("keeps calling Meta below 75 %", async () => {
    server.use(metaMe(usageLow));
    const requests = captureRequests();
    const client = graph();

    await client.get("me");
    await client.get("me");

    expect(requests).toHaveLength(2);
  });
});

describe("createGraph batch and call count", () => {
  it("sends one batch request and maps each item", async () => {
    server.use(metaBatch());
    const requests = captureRequests();

    const results = await graph().batch<{ id: string }>([
      {
        method: "GET",
        path: "120000000000001",
        query: { fields: "id,name" },
      },
      { method: "POST", path: "act_1/ads", body: { name: "Ad" } },
      { method: "GET", path: "me" },
    ]);

    const form = await readForm(requests[0]!);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(form.get("batch")!)).toEqual([
      {
        method: "GET",
        relative_url: "120000000000001?fields=id%2Cname",
      },
      { method: "POST", relative_url: "act_1/ads", body: "name=Ad" },
      { method: "GET", relative_url: "me" },
    ]);
    expect(form.get("include_headers")).toBe("true");
    expect(results[0]).toEqual({
      ok: true,
      data: { id: "120000000000001", name: "Campaña A" },
    });
    expect(results[1]).toMatchObject({
      ok: false,
      error: { kind: "param", code: 100, subcode: 1885183 },
    });
    expect(results[2]).toMatchObject({
      ok: false,
      error: { kind: "transient" },
    });
  });

  it("counts every Graph call, batch items included, for meta_calls", async () => {
    server.use(
      metaMe(),
      metaBatch(),
      metaFails("bad", envelope({ code: 100 })),
    );
    const client = graph();

    await client.get("me");
    await client.batch([
      { method: "GET", path: "a" },
      { method: "GET", path: "b" },
      { method: "GET", path: "c" },
    ]);
    await rejection(client.get("bad"));

    expect(client.callCount()).toBe(5);
  });
});

describe("createGraph session errors", () => {
  it("calls onSessionError on 190", async () => {
    server.use(metaFails("me", sessionFixture));
    const onSessionError = vi.fn(async () => undefined);

    const error = await rejection(graph({ onSessionError }).get("me"));

    expect(error).toMatchObject({ kind: "session", code: 190, subcode: 460 });
    expect(onSessionError).toHaveBeenCalledWith(error);
  });

  it("does not call onSessionError on other errors", async () => {
    server.use(metaFails("me", envelope({ code: 100 })));
    const onSessionError = vi.fn(async () => undefined);

    await rejection(graph({ onSessionError }).get("me"));

    expect(onSessionError).not.toHaveBeenCalled();
  });

  it("calls onSessionError once when a batch item has an invalid session", async () => {
    const sessionItem = { code: 400, body: JSON.stringify(sessionFixture) };
    server.use(metaBatch([sessionItem, sessionItem]));
    const onSessionError = vi.fn(async () => undefined);

    await graph({ onSessionError }).batch([
      { method: "GET", path: "a" },
      { method: "GET", path: "b" },
    ]);

    expect(onSessionError).toHaveBeenCalledTimes(1);
  });
});

describe("createGraph logging", () => {
  it("never logs the token, the proof or query strings", async () => {
    server.use(
      metaFails("me", sessionFixture),
      metaFails("act_1/insights", envelope({ code: 100 })),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const client = graph();

    await rejection(client.get("me", { fields: "id" }));
    await rejection(client.get("act_1/insights", { after: "cursor123" }));

    const output = log.mock.calls.flat().join("\n");
    expect(output.match(/meta\.request_failed/g)).toHaveLength(2);
    expect(output).toContain('"path":"act_1/insights"');
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain(await expectedProof());
    expect(output).not.toContain("cursor123");
  });
});
