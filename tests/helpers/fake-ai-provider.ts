import type { AiCallUsage } from "../../src/shared/ai-neuron-rates";
import type {
  AiProvider,
  AiTextResult,
  AiToolsResult,
  DescribeImageInput,
  GenerateTextInput,
  RunToolsInput,
} from "../../src/api/integrations/ai/provider";

export const FAKE_USAGE: AiCallUsage = {
  model: "fake-model",
  inputTokens: 10,
  outputTokens: 10,
  neurons: 1,
};

type Reply<Result> = Partial<Result> | Error;

interface FakeAiScript {
  generateText?: Reply<AiTextResult>[];
  runTools?: Reply<AiToolsResult>[];
  describeImage?: Reply<AiTextResult>[];
}

export interface FakeAiCall {
  method: keyof FakeAiScript;
  input: GenerateTextInput | RunToolsInput | DescribeImageInput;
}

export class FakeAiProvider implements AiProvider {
  readonly calls: FakeAiCall[] = [];
  private readonly script: Required<FakeAiScript>;

  constructor(script: FakeAiScript = {}) {
    this.script = {
      generateText: [...(script.generateText ?? [])],
      runTools: [...(script.runTools ?? [])],
      describeImage: [...(script.describeImage ?? [])],
    };
  }

  generateText(input: GenerateTextInput): Promise<AiTextResult> {
    return this.reply("generateText", input, { text: "" });
  }

  runTools(input: RunToolsInput): Promise<AiToolsResult> {
    return this.reply("runTools", input, { text: "", toolCalls: [] });
  }

  describeImage(input: DescribeImageInput): Promise<AiTextResult> {
    return this.reply("describeImage", input, { text: "" });
  }

  callsTo(method: keyof FakeAiScript) {
    return this.calls.filter((call) => call.method === method);
  }

  private async reply<Result extends AiTextResult>(
    method: keyof FakeAiScript,
    input: FakeAiCall["input"],
    defaults: Omit<Result, "usage">,
  ): Promise<Result> {
    this.calls.push({ method, input });
    const next = this.script[method].shift();
    if (!next) throw new Error(`FakeAiProvider: no scripted ${method} reply`);
    if (next instanceof Error) throw next;
    return { ...defaults, usage: FAKE_USAGE, ...next } as Result;
  }
}
