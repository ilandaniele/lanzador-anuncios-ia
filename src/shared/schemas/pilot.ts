import { z } from "zod";
import {
  PILOT_RULE_TYPES,
  PILOT_RUN_STATUSES,
  PILOT_RUN_TRIGGERS,
  PROPOSAL_ACTIONS,
  PROPOSAL_STATUSES,
} from "../constants";
import { paginatedSchema, paginationQuerySchema } from "./common";

const levelSchema = z.enum(["campaign", "adset", "ad"]);
const minorAmountSchema = z.int().positive();
const positiveNumberSchema = z.number().positive();

const pauseNoSalesParamsSchema = z.strictObject({
  level: levelSchema,
  targetCpaSource: z.enum(["product_margin", "fixed"]),
  fallbackTargetCpaMinor: minorAmountSchema,
  spendMultiplier: positiveNumberSchema,
  window: z.enum(["today", "yesterday"]),
});

const pauseLowRoasParamsSchema = z.strictObject({
  level: levelSchema,
  roasMax: positiveNumberSchema,
  minSpendMinor: minorAmountSchema,
  window: z.enum(["daily:last_3d", "daily:last_7d"]),
});

const scaleWinnerParamsSchema = z.strictObject({
  breakEvenMultiplier: positiveNumberSchema,
  fallbackMinRoas: positiveNumberSchema,
  days: z.int().min(1).max(30),
  minSpendMinor: minorAmountSchema,
  percent: z.int().min(1),
  minHoursBetween: z.int().min(1),
});

const duplicateWinnerParamsSchema = z.strictObject({
  minRoas: positiveNumberSchema,
  minSpendMinor: minorAmountSchema,
  range: z.enum(["last_7d", "last_14d", "last_30d"]),
});

const ruleOf = <Type extends (typeof PILOT_RULE_TYPES)[number], Params>(
  ruleType: Type,
  params: z.ZodType<Params>,
) =>
  z.strictObject({
    ruleType: z.literal(ruleType),
    enabled: z.boolean(),
    params,
  });

export const pilotRuleSchema = z.discriminatedUnion("ruleType", [
  ruleOf("pause_no_sales", pauseNoSalesParamsSchema),
  ruleOf("pause_low_roas", pauseLowRoasParamsSchema),
  ruleOf("scale_winner", scaleWinnerParamsSchema),
  ruleOf("duplicate_winner", duplicateWinnerParamsSchema),
]);
export type PilotRule = z.infer<typeof pilotRuleSchema>;

export const updatePilotRulesRequestSchema = z.strictObject({
  rules: z
    .array(pilotRuleSchema)
    .min(1)
    .max(PILOT_RULE_TYPES.length)
    .refine(
      (rules) =>
        new Set(rules.map(({ ruleType }) => ruleType)).size === rules.length,
    ),
});
export type UpdatePilotRulesRequest = z.infer<
  typeof updatePilotRulesRequestSchema
>;

export const pilotRulesResponseSchema = z.object({
  data: z.array(pilotRuleSchema),
});
export type PilotRulesResponse = z.infer<typeof pilotRulesResponseSchema>;

export const pilotRunDtoSchema = z.object({
  id: z.string(),
  trigger: z.enum(PILOT_RUN_TRIGGERS),
  status: z.enum(PILOT_RUN_STATUSES),
  proposalsCreated: z.int().min(0),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type PilotRunDto = z.infer<typeof pilotRunDtoSchema>;

export const pilotProposalDtoSchema = z.object({
  id: z.string(),
  runId: z.string(),
  ruleType: z.enum(PILOT_RULE_TYPES),
  action: z.enum(PROPOSAL_ACTIONS),
  adAccountId: z.string(),
  level: levelSchema,
  objectId: z.string(),
  objectName: z.string(),
  evidence: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  currentBudgetMinor: z.int().nullable(),
  proposedBudgetMinor: z.int().nullable(),
  percent: z.int().nullable(),
  explanation: z.string().nullable(),
  status: z.enum(PROPOSAL_STATUSES),
  resultMessage: z.string().nullable(),
  launchId: z.string().nullable(),
  decidedAt: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type PilotProposalDto = z.infer<typeof pilotProposalDtoSchema>;

export const pilotRunResponseSchema = z.object({
  run: pilotRunDtoSchema,
  proposals: z.array(pilotProposalDtoSchema),
});
export type PilotRunResponse = z.infer<typeof pilotRunResponseSchema>;

export const pilotRunsResponseSchema = paginatedSchema(pilotRunDtoSchema);

export const listPilotProposalsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PROPOSAL_STATUSES).exclude(["executing"]).default("pending"),
});
export type ListPilotProposalsQuery = z.infer<
  typeof listPilotProposalsQuerySchema
>;

export const pilotProposalsResponseSchema = paginatedSchema(
  pilotProposalDtoSchema,
);
