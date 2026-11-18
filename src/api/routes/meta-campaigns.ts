import { Hono } from "hono";
import {
  adPreviewQuerySchema,
  campaignAdsQuerySchema,
  campaignReferenceQuerySchema,
  listCampaignsQuerySchema,
  metaIdSchema,
} from "../../shared/schemas/meta-campaigns";
import { notFound } from "../lib/errors";
import { parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { adPreview, campaignAds } from "../services/meta/ads";
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
  )
  .get(
    "/w/:wid/meta/campaigns/:campaignId/ads",
    ...member("editor"),
    async (c) => {
      const campaignId = metaIdParam(c.req.param("campaignId"));
      const { adAccountAssetId, range } = parseQuery(c, campaignAdsQuerySchema);
      return c.json(
        await campaignAds(
          c.env,
          c.get("scope")!,
          campaignId,
          adAccountAssetId,
          range,
        ),
      );
    },
  )
  .get("/w/:wid/meta/ads/:adId/preview", ...member("viewer"), async (c) => {
    const adId = metaIdParam(c.req.param("adId"));
    const { adAccountAssetId } = parseQuery(c, adPreviewQuerySchema);
    return c.json(
      await adPreview(c.env, c.get("scope")!, adId, adAccountAssetId),
    );
  });
