import type { AiToolCall } from "../../integrations/ai/provider";
import { AppError } from "../../lib/errors";
import { createLaunchDraftTool } from "./draft-tool";
import {
  listCampaignsTool,
  listEnabledAssetsTool,
  listRecentCreativesTool,
  searchProductsTool,
} from "./read-tools";
import { toolError, type ToolContext } from "./tool-kit";

const CHAT_TOOLS = [
  searchProductsTool,
  listEnabledAssetsTool,
  listCampaignsTool,
  listRecentCreativesTool,
  createLaunchDraftTool,
];

const toolsByName = new Map(CHAT_TOOLS.map((tool) => [tool.spec.name, tool]));

export const CHAT_TOOL_SPECS = CHAT_TOOLS.map(({ spec }) => spec);

export async function runChatTool(context: ToolContext, call: AiToolCall) {
  const tool = toolsByName.get(call.name);
  if (!tool) return toolError("unknown_tool");
  try {
    return await tool.execute(context, call.arguments);
  } catch (error) {
    if (error instanceof AppError) return toolError(error.code);
    throw error;
  }
}
