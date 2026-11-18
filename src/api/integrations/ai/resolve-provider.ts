import type { Env } from "../../env";
import type { AiProvider } from "./provider";
import { createWorkersAiProvider } from "./workers-ai";

export const resolveAiProvider = (env: Env): AiProvider =>
  env.AI_PROVIDER ?? createWorkersAiProvider(env);
