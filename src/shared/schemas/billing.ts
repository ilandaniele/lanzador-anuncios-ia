import { z } from "zod";
import { PAID_PLAN_IDS, SUBSCRIPTION_STATUSES } from "../billing";

export const subscribeRequestSchema = z.object({
  planId: z.enum(PAID_PLAN_IDS),
});

export const subscribeResponseSchema = z.object({ initPoint: z.url() });

export const billingPlanSchema = z.object({
  id: z.enum(PAID_PLAN_IDS),
  name: z.string(),
  priceMonthlyMinor: z.int(),
  currency: z.string(),
  maxMembers: z.int(),
  maxAdAccounts: z.int(),
});
export type BillingPlan = z.infer<typeof billingPlanSchema>;

export const billingOverviewSchema = z.object({
  planId: z.string(),
  planName: z.string(),
  isFree: z.boolean(),
  blocked: z.boolean(),
  trialEndsAt: z.iso.datetime().nullable(),
  subscription: z
    .object({
      planId: z.enum(PAID_PLAN_IDS),
      status: z.enum(SUBSCRIPTION_STATUSES),
      paidUntil: z.iso.datetime().nullable(),
    })
    .nullable(),
  plans: z.array(billingPlanSchema),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;
