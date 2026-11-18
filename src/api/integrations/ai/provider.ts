import type { AiCallUsage } from "../../../shared/ai-neuron-rates";

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type AiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AiToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface AiImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface GenerateTextInput {
  system?: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
}

export interface RunToolsInput {
  messages: AiMessage[];
  tools: AiToolSpec[];
  maxTokens?: number;
}

export interface DescribeImageInput {
  system?: string;
  prompt: string;
  image: AiImage;
  json?: boolean;
  maxTokens?: number;
}

export interface AiTextResult {
  text: string;
  usage: AiCallUsage;
}

export interface AiToolsResult extends AiTextResult {
  toolCalls: AiToolCall[];
}

export interface AiProvider {
  generateText(input: GenerateTextInput): Promise<AiTextResult>;
  runTools(input: RunToolsInput): Promise<AiToolsResult>;
  describeImage(input: DescribeImageInput): Promise<AiTextResult>;
}
