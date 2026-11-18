import { z } from "zod";
import { currencySchema } from "./common";
import { launchListItemSchema } from "./launch";
import { pilotProposalDtoSchema } from "./pilot";

export const TODAY_ALERT_SEVERITIES = ["error", "warn"] as const;
export const TODAY_ALERT_KINDS = [
  "reconnect_required",
  "account_problem",
  "ads_rejected",
  "launch_failed",
  "token_expiring",
] as const;
export const PENDING_COUNT_CAP = 51;
export const TODAY_TOP_PROPOSALS = 5;
export const TODAY_LAST_LAUNCHES = 5;

const ratio = z.number().nullable();

export const todayAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: currencySchema,
  spendTodayMinor: z.int(),
  spendYesterdayMinor: z.int(),
  purchases: z.int(),
  roas: ratio,
  cpaMinor: z.int().nullable(),
});
export type TodayAccountDto = z.infer<typeof todayAccountSchema>;

export const todayAlertSchema = z.object({
  kind: z.enum(TODAY_ALERT_KINDS),
  severity: z.enum(TODAY_ALERT_SEVERITIES),
  text: z.string(),
  objectId: z.string(),
});
export type TodayAlertDto = z.infer<typeof todayAlertSchema>;

export const todayResponseSchema = z.object({
  accounts: z.array(todayAccountSchema),
  alerts: z.array(todayAlertSchema),
  proposals: z.object({
    pendingCount: z.int().min(0).max(PENDING_COUNT_CAP),
    top: z.array(pilotProposalDtoSchema).max(TODAY_TOP_PROPOSALS),
  }),
  launches: z.array(launchListItemSchema).max(TODAY_LAST_LAUNCHES),
  updatedAt: z.iso.datetime().nullable(),
  stale: z.boolean(),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;
