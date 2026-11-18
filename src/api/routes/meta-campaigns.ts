import { Hono } from "hono";
import {
  campaignReferenceQuerySchema,
  listCampaignsQuerySchema,
  metaIdSchema,
} from "../../shared/schemas/meta-campaigns";
import { notFound } from "../lib/errors";
import { parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import {
  campaignReference,
  listAccountCampaigns,
} from "../services/meta/campaigns";
import type { AppEnv } from "../types";

function metaIdParam(raw: string) {
  const result = metaIdSchema.safeParse(raw);
  if (!result.success) throw notFound();
  return result.data;
}

export const metaCampaignRoutes = new Hono<AppEnv>()
  .get(
    "/w/:wid/meta/ad-accounts/:assetId/campaigns",
    ...member("viewer"),
    async (c) =>
      c.json(
        await listAccountCampaigns(
          c.env,
          c.get("scope")!,
          c.req.param("assetId"),
          parseQuery(c, listCampaignsQuerySchema).status,
        ),
      ),
  )
  .get(
    "/w/:wid/meta/campaigns/:campaignId/reference",
    ...member("editor"),
    async (c) => {
      const campaignId = metaIdParam(c.req.param("campaignId"));
      const { adAccountAssetId } = parseQuery(c, campaignReferenceQuerySchema);
      return c.json(
        await campaignReference(
          c.env,
          c.get("scope")!,
          campaignId,
          adAccountAssetId,
        ),
      );
    },
  );
