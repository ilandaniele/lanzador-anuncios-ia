import type { AiCallUsage } from "../../../shared/ai-neuron-rates";
import type { ChatReply } from "../../../shared/schemas/chat";
import type { Env } from "../../env";
import type { AiMessage, AiToolCall } from "../../integrations/ai/provider";
import { resolveAiProvider } from "../../integrations/ai/resolve-provider";
import { selectRecentChatHistory } from "../../repositories/chat";
import type { Scope } from "../../repositories/scope";
import {
  asData,
  CHAT_SYSTEM_PROMPT,
  TOOL_DATA_LABEL,
  USER_DATA_LABEL,
} from "../ai/prompts/chat";
import { assertAiBudget, recordAiUsage } from "../ai-budget";
import { appendSessionMessages, findSessionWithRoom } from "./sessions";
import { toolError, type ToolContext } from "./tool-kit";
import { CHAT_TOOL_SPECS, runChatTool } from "./tools";

const MAX_ITERATIONS = 6;
const HISTORY_SIZE = 20;
const MAX_TOOL_CALLS_PER_ITERATION = 5;
const MAX_OUTPUT_TOKENS = 1500;
const MESSAGES_PER_EXCHANGE = 3;
const CONTENT_MAX = 8000;
const FALLBACK_REPLY =
  "No pude terminar el pedido. Probá de nuevo con más detalle.";

interface AgentTurn {
  reply: string;
  toolCalls: AiToolCall[];
}

const userMessage = (content: string): AiMessage => ({
  role: "user",
  content: asData(USER_DATA_LABEL, content),
});

const buildConversation = (
  history: { role: "user" | "assistant"; content: string }[],
  text: string,
): AiMessage[] => [
  { role: "system", content: CHAT_SYSTEM_PROMPT },
  ...history.map((message) =>
    message.role === "user" ? userMessage(message.content) : message,
  ),
  userMessage(text),
];

async function answerToolCalls(
  context: ToolContext,
  toolCalls: AiToolCall[],
): Promise<AiMessage[]> {
  const replies: AiMessage[] = [];
  for (const [index, call] of toolCalls.entries()) {
    const outcome =
      index < MAX_TOOL_CALLS_PER_ITERATION
        ? await runChatTool(context, call)
        : toolError("too_many_tool_calls");
    replies.push({
      role: "tool",
      toolCallId: call.id,
      content: asData(TOOL_DATA_LABEL, outcome),
    });
  }
  return replies;
}

async function runAgentLoop(
  env: Env,
  context: ToolContext,
  conversation: AiMessage[],
  usages: AiCallUsage[],
): Promise<AgentTurn> {
  const provider = resolveAiProvider(env);
  const toolCalls: AiToolCall[] = [];
  let messages = conversation;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await provider.runTools({
      messages,
      tools: CHAT_TOOL_SPECS,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    usages.push(result.usage);
    if (result.toolCalls.length === 0) {
      return { reply: result.text.trim() || FALLBACK_REPLY, toolCalls };
    }
    toolCalls.push(...result.toolCalls);
    messages = [
      ...messages,
      { role: "assistant", content: result.text, toolCalls: result.toolCalls },
      ...(await answerToolCalls(context, result.toolCalls)),
    ];
  }
  return { reply: FALLBACK_REPLY, toolCalls };
}

const toolLogMessage = (toolCalls: AiToolCall[]) => {
  const names = [...new Set(toolCalls.map(({ name }) => name))].join(",");
  return {
    role: "tool" as const,
    content: names.slice(0, CONTENT_MAX),
    toolName: names,
    toolPayload: JSON.stringify(
      toolCalls.map(({ name, arguments: args }) => ({ name, arguments: args })),
    ),
  };
};

const exchangeMessages = (text: string, { reply, toolCalls }: AgentTurn) => [
  { role: "user" as const, content: text },
  ...(toolCalls.length > 0 ? [toolLogMessage(toolCalls)] : []),
  { role: "assistant" as const, content: reply.slice(0, CONTENT_MAX) },
];

async function runRecordedAgent(
  env: Env,
  context: ToolContext,
  conversation: AiMessage[],
  sessionId: string,
) {
  const usages: AiCallUsage[] = [];
  try {
    return await runAgentLoop(env, context, conversation, usages);
  } finally {
    await recordAiUsage(env.DB, context.scope.workspaceId, "chat", usages, {
      userId: context.scope.userId,
      refId: sessionId,
    });
  }
}

export async function sendChatMessage(
  env: Env,
  scope: Scope,
  sessionId: string,
  text: string,
): Promise<ChatReply> {
  await findSessionWithRoom(env.DB, scope, sessionId, MESSAGES_PER_EXCHANGE);
  await assertAiBudget(env.DB, env, scope.workspaceId);
  const history = await selectRecentChatHistory(
    env.DB,
    scope,
    sessionId,
    HISTORY_SIZE,
  );
  const context: ToolContext = { env, scope };
  const turn = await runRecordedAgent(
    env,
    context,
    buildConversation(history, text),
    sessionId,
  );
  const stored = await appendSessionMessages(
    env.DB,
    scope,
    sessionId,
    exchangeMessages(text, turn),
    context.draftLaunchId,
  );
  return {
    messages: stored.filter(({ role }) => role === "assistant"),
    ...(context.draftLaunchId ? { draftLaunchId: context.draftLaunchId } : {}),
  };
}
