import { z } from "zod";
import type { AiToolSpec } from "../../integrations/ai/provider";
import type { Env } from "../../env";
import type { Scope } from "../../repositories/scope";

export interface ToolContext {
  env: Env;
  scope: Scope;
  draftLaunchId?: string;
}

export interface ChatTool {
  spec: AiToolSpec;
  execute(context: ToolContext, rawArgs: unknown): Promise<unknown>;
}

interface ToolDefinition<Args extends z.ZodType> {
  name: string;
  description: string;
  args: Args;
  run(context: ToolContext, args: z.infer<Args>): Promise<unknown>;
}

export const toolError = (error: string, fields?: Record<string, string>) => ({
  error,
  ...(fields ? { fields } : {}),
});

const issueFields = (error: z.ZodError) =>
  Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.code]),
  );

export const defineTool = <Args extends z.ZodType>({
  name,
  description,
  args,
  run,
}: ToolDefinition<Args>): ChatTool => ({
  spec: {
    name,
    description,
    parameters: z.toJSONSchema(args, { io: "input" }),
  },
  async execute(context, rawArgs) {
    const parsed = args.safeParse(rawArgs);
    return parsed.success
      ? run(context, parsed.data)
      : toolError("invalid_arguments", issueFields(parsed.error));
  },
});
