import { z } from "zod";
import { SUBSCRIPTION_STATUSES } from "../../../shared/billing";

const providerDate = z.iso.datetime({ offset: true });

const preapprovalSummarySchema = z.object({
  charged_quantity: z.number().int().nonnegative().nullish(),
  last_charged_date: providerDate.nullish(),
});

export type PreapprovalSummary = z.infer<typeof preapprovalSummarySchema>;

export const preapprovalResponseSchema = z.object({
  id: z.string().min(1).max(128),
  status: z.enum(SUBSCRIPTION_STATUSES),
  external_reference: z.string(),
  init_point: z.url({
    protocol: /^https$/,
    hostname: /(^|\.)mercadopago\.com(\.[a-z]{2})?$/,
  }),
  auto_recurring: z.object({
    transaction_amount: z.number(),
    currency_id: z.string(),
  }),
  summarized: preapprovalSummarySchema.nullish(),
});

export const authorizedPaymentResponseSchema = z.object({
  preapproval_id: z.string().min(1).max(128),
});
