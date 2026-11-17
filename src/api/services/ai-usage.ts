import type { AiUsage } from "../../shared/schemas/workspaces";
import type { AiNeurons } from "../repositories/usage-counters";

export const buildAiUsage = (input: {
  dailyCap: number;
  monthlyCap: number;
  globalCap: number;
  neurons: AiNeurons;
  resetsAt: number;
}): AiUsage => ({
  neuronsToday: input.neurons.workspaceDay,
  dailyCap: input.dailyCap,
  neuronsMonth: input.neurons.workspaceMonth,
  monthlyCap: input.monthlyCap,
  globalExhausted: input.neurons.globalDay >= input.globalCap,
  resetsAt: new Date(input.resetsAt).toISOString(),
});
