import { describe, expect, it, vi } from "vitest";
import {
  CHAT_TIMEOUT_MS,
  createWorkersAiProvider,
  TEXT_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
  WorkersAiProvider,
  type AiRunner,
} from "../../../src/api/integrations/ai/workers-ai";
import { AppError } from "../../../src/api/lib/errors";
import { measureAiUsage } from "../../../src/shared/ai-neuron-rates";
import { FAKE_USAGE, FakeAiProvider } from "../../helpers/fake-ai-provider";

const MODELS = {
  text: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  chat: "@cf/meta/llama-4-scout-17b-16e-instruct",
  vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
};

const tokens = (prompt: number, completion: number) => ({
  prompt_tokens: prompt,
  completion_tokens: completion,
});

const serverError = (status = 500) =>
  Object.assign(new Error("boom"), { status });

const providerWith = (...outcomes: unknown[]) => {
  const run = vi.fn<AiRunner["run"]>();
  for (const outcome of outcomes) {
    if (outcome instanceof Error) run.mockRejectedValueOnce(outcome);
    else run.mockResolvedValueOnce(outcome);
  }
  return { run, provider: new WorkersAiProvider({ run }, MODELS) };
};

const expectUpstream = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status: 502, code: "AI_UPSTREAM" });
};

describe("generateText", () => {
  it("returns text and neurons computed from the text model rate", async () => {
    const { run, provider } = providerWith({
      response: "hola",
      usage: tokens(1000, 500),
    });

    const result = await provider.generateText({
      system: "sys",
      prompt: "pedido",
    });

    expect(result.text).toBe("hola");
    expect(result.usage).toEqual(measureAiUsage(MODELS.text, 1000, 500));
    expect(result.usage.neurons).toBeGreaterThan(0);
    const [model, inputs, options] = run.mock.calls[0]!;
    expect(model).toBe(MODELS.text);
    expect(inputs).toEqual({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "pedido" },
      ],
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(TEXT_TIMEOUT_MS).toBe(60_000);
  });

  it("asks for JSON mode and stringifies an already parsed object", async () => {
    const { run, provider } = providerWith({
      response: { ok: true },
      usage: tokens(10, 10),
    });

    const result = await provider.generateText({
      prompt: "p",
      json: true,
      maxTokens: 200,
    });

    expect(JSON.parse(result.text)).toEqual({ ok: true });
    expect(run.mock.calls[0]![1]).toMatchObject({
      response_format: { type: "json_object" },
      max_tokens: 200,
    });
  });

  it("estimates tokens when the model reports no usage", async () => {
    const { provider } = providerWith({ response: "abcdefgh" });

    const { usage } = await provider.generateText({ prompt: "abcdefgh" });

    expect(usage.inputTokens).toBe(2);
    expect(usage.outputTokens).toBe(2);
  });
});

describe("runTools", () => {
  const tools = [
    {
      name: "search_products",
      description: "Busca productos",
      parameters: { type: "object", properties: {} },
    },
  ];

  it("maps legacy tool_calls and sends tools with the chat model", async () => {
    const { run, provider } = providerWith({
      response: null,
      tool_calls: [{ name: "search_products", arguments: { q: "taza" } }],
      usage: tokens(2000, 100),
    });

    const result = await provider.runTools({
      messages: [{ role: "user", content: "buscá tazas" }],
      tools,
    });

    expect(result.toolCalls).toEqual([
      { id: "call_0", name: "search_products", arguments: { q: "taza" } },
    ]);
    expect(result.text).toBe("");
    expect(result.usage).toEqual(measureAiUsage(MODELS.chat, 2000, 100));
    const [model, inputs] = run.mock.calls[0]!;
    expect(model).toBe(MODELS.chat);
    expect(inputs).toMatchObject({
      tools: [{ type: "function", function: tools[0] }],
    });
    expect(CHAT_TIMEOUT_MS).toBe(90_000);
  });

  it("maps OpenAI-style choices with string arguments", async () => {
    const { provider } = providerWith({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "abc",
                type: "function",
                function: {
                  name: "search_products",
                  arguments: '{"q":"taza"}',
                },
              },
            ],
          },
        },
      ],
      usage: tokens(10, 5),
    });

    const result = await provider.runTools({ messages: [], tools });

    expect(result.toolCalls).toEqual([
      { id: "abc", name: "search_products", arguments: { q: "taza" } },
    ]);
  });

  it("serialises assistant tool calls and tool results back to the model", async () => {
    const { run, provider } = providerWith({
      response: "listo",
      usage: tokens(10, 5),
    });
    const call = { id: "c1", name: "search_products", arguments: { q: "x" } };

    await provider.runTools({
      messages: [
        { role: "assistant", content: "", toolCalls: [call] },
        { role: "tool", toolCallId: "c1", content: "[]" },
      ],
      tools,
    });

    expect(run.mock.calls[0]![1]).toMatchObject({
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "search_products", arguments: '{"q":"x"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: "[]" },
      ],
    });
  });

  it("rejects malformed tool arguments as AI_UPSTREAM", async () => {
    const { provider } = providerWith({
      tool_calls: [{ name: "search_products", arguments: "{not json" }],
      usage: tokens(1, 1),
    });

    await expectUpstream(provider.runTools({ messages: [], tools }));
  });
});

describe("describeImage", () => {
  it("sends the image as a data URL to the vision model and prices it", async () => {
    const { run, provider } = providerWith({
      response: '{"hook":"x"}',
      usage: tokens(3000, 200),
    });

    const result = await provider.describeImage({
      prompt: "describí",
      image: { bytes: Uint8Array.from([1, 2, 3]), mimeType: "image/jpeg" },
      json: true,
    });

    expect(result.text).toBe('{"hook":"x"}');
    expect(result.usage).toEqual(measureAiUsage(MODELS.vision, 3000, 200));
    const [model, inputs] = run.mock.calls[0]!;
    expect(model).toBe(MODELS.vision);
    expect(inputs).toMatchObject({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describí" },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,AQID" },
            },
          ],
        },
      ],
    });
    expect(VISION_TIMEOUT_MS).toBe(30_000);
  });
});

describe("retries", () => {
  it("retries once after a 5xx and returns the success", async () => {
    const { run, provider } = providerWith(serverError(503), {
      response: "ok",
      usage: tokens(10, 10),
    });

    const result = await provider.generateText({ prompt: "p" });

    expect(result.text).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("throws 502 AI_UPSTREAM after two failures", async () => {
    const { run, provider } = providerWith(serverError(), serverError(502));

    await expectUpstream(provider.generateText({ prompt: "p" }));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const { run, provider } = providerWith(serverError(400));

    await expectUpstream(provider.generateText({ prompt: "p" }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not retry a timeout", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const { run, provider } = providerWith(timeout);

    await expectUpstream(provider.generateText({ prompt: "p" }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps prompts out of the error", async () => {
    const { provider } = providerWith(serverError(), serverError());

    const error = await provider
      .generateText({ prompt: "SECRET-PROMPT" })
      .catch((e: unknown) => e);

    expect(
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    ).not.toContain("SECRET-PROMPT");
  });
});

describe("createWorkersAiProvider", () => {
  const models = {
    WORKERS_AI_TEXT_MODEL: MODELS.text,
    WORKERS_AI_CHAT_MODEL: MODELS.chat,
    WORKERS_AI_VISION_MODEL: MODELS.vision,
  };

  it("fails with AI_UPSTREAM when the AI binding is missing", () => {
    expect(() => createWorkersAiProvider(models as never)).toThrowError(
      expect.objectContaining({ status: 502, code: "AI_UPSTREAM" }),
    );
  });

  it("reads model ids from env vars", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ response: "x", usage: tokens(1, 1) });
    const provider = createWorkersAiProvider({
      ...models,
      WORKERS_AI_TEXT_MODEL: "custom-text",
      AI: { run } as never,
    });

    await provider.generateText({ prompt: "p" });

    expect(run.mock.calls[0]![0]).toBe("custom-text");
  });
});

describe("FakeAiProvider", () => {
  it("plays scripted replies in order, records calls and throws scripted errors", async () => {
    const fake = new FakeAiProvider({
      generateText: [{ text: "uno" }, new Error("down")],
    });

    const first = await fake.generateText({ prompt: "a" });

    expect(first).toEqual({ text: "uno", usage: FAKE_USAGE });
    await expect(fake.generateText({ prompt: "b" })).rejects.toThrow("down");
    await expect(fake.generateText({ prompt: "c" })).rejects.toThrow(
      "no scripted generateText reply",
    );
    expect(fake.callsTo("generateText")).toHaveLength(3);
  });
});
