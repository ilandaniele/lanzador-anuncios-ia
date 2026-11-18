import { z } from "zod";
import { PILOT_RULE_TYPES } from "../constants";

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
