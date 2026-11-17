import { z } from "zod";
import { ROLES, WORKSPACE_STATUSES } from "../constants";

const WORKSPACE_NAME_MAX = 80;
const NAME_TEMPLATE_MAX = 120;
const COUNTRIES_MAX = 50;

const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const workspaceNameRequestSchema = z.object({
  name: z.string().trim().min(1).max(WORKSPACE_NAME_MAX),
});

export const deleteWorkspaceRequestSchema = z.object({
  confirmName: z.string().max(WORKSPACE_NAME_MAX),
});

const nameTemplateSchema = z.string().trim().min(1).max(NAME_TEMPLATE_MAX);

const nameTemplatesSchema = z.object({
  campaign: nameTemplateSchema,
  adset: nameTemplateSchema,
  ad: nameTemplateSchema,
});

const settingsFields = {
  maxCampaignBudgetMinor: z.int().positive(),
  budgetCurrency: z.string().regex(/^[A-Z]{3}$/),
  maxScalePercent: z.int().min(1),
  advantageCreativeEnabled: z.boolean(),
  timezone: z.string().refine(isValidTimeZone),
  defaultCountries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .min(1)
    .max(COUNTRIES_MAX),
  nameTemplates: nameTemplatesSchema,
  launchDefaults: z.record(z.string(), z.unknown()),
};

export const settingsSchema = z.object(settingsFields);
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = z
  .object({ ...settingsFields, nameTemplates: nameTemplatesSchema.partial() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  planId: z.string(),
  status: z.enum(WORKSPACE_STATUSES),
  createdAt: z.iso.datetime(),
});
export type WorkspaceDto = z.infer<typeof workspaceSchema>;

export const createWorkspaceResponseSchema = z.object({
  workspace: workspaceSchema,
  role: z.literal("owner"),
});

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  limits: z.object({
    maxMembers: z.number(),
    maxAdAccounts: z.number(),
    maxCreativesPerLaunch: z.number(),
    aiDailyNeurons: z.number(),
    aiMonthlyNeurons: z.number(),
  }),
});

export const aiUsageSchema = z.object({
  neuronsToday: z.number(),
  dailyCap: z.number(),
  neuronsMonth: z.number(),
  monthlyCap: z.number(),
  globalExhausted: z.boolean(),
  resetsAt: z.iso.datetime(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const workspaceOverviewSchema = z.object({
  workspace: workspaceSchema,
  role: z.enum(ROLES),
  plan: planSchema,
  settings: settingsSchema,
  aiUsage: aiUsageSchema,
});
export type WorkspaceOverview = z.infer<typeof workspaceOverviewSchema>;

export const deleteWorkspaceResponseSchema = z.object({
  purgeAfter: z.iso.datetime(),
});
