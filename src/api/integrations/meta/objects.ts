import { z } from "zod";
import type { Graph } from "./client";
import { invalidPayloadError } from "./errors";

const OBJECT_FIELDS = "account_id,name,status";
const CAMPAIGN_BUDGET_FIELDS = "account_id,name,daily_budget";

const objectSchema = z.object({
  account_id: z.string(),
  name: z.string(),
  status: z.string(),
});

const campaignBudgetSchema = z.object({
  account_id: z.string(),
  name: z.string(),
  daily_budget: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export interface MetaObject {
  accountId: string;
  name: string;
  status: string;
}

export interface CampaignBudget {
  accountId: string;
  name: string;
  dailyBudgetMinor: number | null;
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

export async function getMetaObject(
  graph: Graph,
  objectId: string,
): Promise<MetaObject> {
  const object = parse(
    objectSchema,
    await graph.get<unknown>(objectId, { fields: OBJECT_FIELDS }),
  );
  return {
    accountId: object.account_id,
    name: object.name,
    status: object.status,
  };
}

export async function getCampaignBudget(
  graph: Graph,
  campaignId: string,
): Promise<CampaignBudget> {
  const campaign = parse(
    campaignBudgetSchema,
    await graph.get<unknown>(campaignId, { fields: CAMPAIGN_BUDGET_FIELDS }),
  );
  return {
    accountId: campaign.account_id,
    name: campaign.name,
    dailyBudgetMinor: campaign.daily_budget ?? null,
  };
}
