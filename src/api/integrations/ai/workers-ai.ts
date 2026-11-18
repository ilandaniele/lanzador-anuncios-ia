import {
  measureAiUsage,
  type AiCallUsage,
} from "../../../shared/ai-neuron-rates";
import type { Env } from "../../env";
import { AppError } from "../../lib/errors";
import { logEvent } from "../../lib/logger";
import type {
  AiMessage,
  AiProvider,
  AiTextResult,
  AiToolCall,
  AiToolsResult,
  DescribeImageInput,
  GenerateTextInput,
  RunToolsInput,
} from "./provider";

export const TEXT_TIMEOUT_MS = 60_000;
export const CHAT_TIMEOUT_MS = 90_000;
export const VISION_TIMEOUT_MS = 30_000;

const MAX_ATTEMPTS = 2;
const CHARS_PER_TOKEN = 4;
const BASE64_CHUNK_BYTES = 0x8000;

export interface AiRunner {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<unknown>;
}

export interface WorkersAiModels {
  text: string;
  chat: string;
  vision: string;
}

type WorkersAiEnv = Pick<
  Env,
  | "AI"
  | "WORKERS_AI_TEXT_MODEL"
  | "WORKERS_AI_CHAT_MODEL"
  | "WORKERS_AI_VISION_MODEL"
>;

type Dict = Record<string, unknown>;

interface Completion {
  text: string;
  toolCalls: AiToolCall[];
  usage: AiCallUsage;
}

const isDict = (value: unknown): value is Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const upstream = (model: string, providerStatus: number | null, why: string) =>
  new AppError(502, "AI_UPSTREAM", {
    message: why,
    details: { model, providerStatus },
  });

const statusOf = (error: unknown): number | undefined => {
  if (!isDict(error)) return undefined;
  const status = error.status ?? error.statusCode;
  return typeof status === "number" ? status : undefined;
};

const isTimeout = (error: unknown) =>
  error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

const isRetryable = (error: unknown) => {
  if (isTimeout(error)) return false;
  const status = statusOf(error);
  return status === undefined || status >= 500;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
};

const estimateTokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

const safeParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const parseArguments = (model: string, raw: unknown): Dict => {
  if (raw === undefined || raw === null || raw === "") return {};
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!isDict(value)) throw upstream(model, null, "Malformed tool arguments");
  return value;
};

const readToolCalls = (model: string, raw: unknown): AiToolCall[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const call = isDict(entry) ? entry : {};
    const fn = isDict(call.function) ? call.function : call;
    if (typeof fn.name !== "string") {
      throw upstream(model, null, "Malformed tool call");
    }
    return {
      id: typeof call.id === "string" ? call.id : `call_${index}`,
      name: fn.name,
      arguments: parseArguments(model, fn.arguments),
    };
  });
};

const readText = (content: unknown): string => {
  if (typeof content === "string") return content;
  return content === undefined || content === null
    ? ""
    : JSON.stringify(content);
};

const unwrapOutput = (model: string, output: unknown) => {
  if (!isDict(output)) throw upstream(model, null, "Empty model output");
  const choice = Array.isArray(output.choices) ? output.choices[0] : undefined;
  const message =
    isDict(choice) && isDict(choice.message) ? choice.message : output;
  return {
    content: "content" in message ? message.content : message.response,
    toolCalls: message.tool_calls,
    usage: isDict(output.usage) ? output.usage : {},
  };
};

const toWireMessage = (message: AiMessage): Dict => {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    };
  }
  return { role: message.role, content: message.content };
};

const withSystem = (system: string | undefined, rest: Dict[]): Dict[] =>
  system ? [{ role: "system", content: system }, ...rest] : rest;

const buildInputs = (
  messages: Dict[],
  options: { json?: boolean; maxTokens?: number },
): Dict => ({
  messages,
  ...(options.json ? { response_format: { type: "json_object" } } : {}),
  ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
});

export class WorkersAiProvider implements AiProvider {
  constructor(
    private readonly ai: AiRunner,
    private readonly models: WorkersAiModels,
  ) {}

  generateText(input: GenerateTextInput): Promise<AiTextResult> {
    const messages = withSystem(input.system, [
      { role: "user", content: input.prompt },
    ]);
    return this.complete(
      this.models.text,
      TEXT_TIMEOUT_MS,
      buildInputs(messages, input),
      (input.system?.length ?? 0) + input.prompt.length,
    );
  }

  runTools(input: RunToolsInput): Promise<AiToolsResult> {
    const inputs = {
      ...buildInputs(input.messages.map(toWireMessage), input),
      tools: input.tools.map((tool) => ({ type: "function", function: tool })),
    };
    return this.complete(
      this.models.chat,
      CHAT_TIMEOUT_MS,
      inputs,
      JSON.stringify(inputs).length,
    );
  }

  describeImage(input: DescribeImageInput): Promise<AiTextResult> {
    const dataUrl = `data:${input.image.mimeType};base64,${toBase64(input.image.bytes)}`;
    const messages = withSystem(input.system, [
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]);
    return this.complete(
      this.models.vision,
      VISION_TIMEOUT_MS,
      buildInputs(messages, input),
      (input.system?.length ?? 0) + input.prompt.length,
    );
  }

  private async complete(
    model: string,
    timeoutMs: number,
    inputs: Dict,
    inputChars: number,
  ): Promise<Completion> {
    const output = await this.runWithRetry(model, timeoutMs, inputs);
    const { content, toolCalls, usage } = unwrapOutput(model, output);
    const text = readText(content);
    const calls = readToolCalls(model, toolCalls);
    const inputTokens =
      typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : estimateTokens(inputChars);
    const outputTokens =
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : estimateTokens(
            text.length + (calls.length ? JSON.stringify(calls).length : 0),
          );
    return {
      text,
      toolCalls: calls,
      usage: measureAiUsage(model, inputTokens, outputTokens),
    };
  }

  private async runWithRetry(
    model: string,
    timeoutMs: number,
    inputs: Dict,
  ): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.ai.run(model, inputs, {
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) break;
      }
    }
    const providerStatus = statusOf(lastError) ?? null;
    logEvent("warn", "ai.upstream_failed", { model, providerStatus });
    throw upstream(model, providerStatus, "Workers AI call failed");
  }
}

export function createWorkersAiProvider(env: WorkersAiEnv): AiProvider {
  if (!env.AI) {
    throw upstream(env.WORKERS_AI_TEXT_MODEL, null, "AI binding missing");
  }
  return new WorkersAiProvider(env.AI as unknown as AiRunner, {
    text: env.WORKERS_AI_TEXT_MODEL,
    chat: env.WORKERS_AI_CHAT_MODEL,
    vision: env.WORKERS_AI_VISION_MODEL,
  });
}
