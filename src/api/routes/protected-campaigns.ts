import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/schemas/common";
import { protectCampaignRequestSchema } from "../../shared/schemas/meta-actions";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import {
  listProtectedCampaigns,
  protectCampaign,
  unprotectCampaign,
} from "../services/protected-campaigns";
import type { AppEnv } from "../types";
import { metaIdParam } from "./meta-campaigns";

export const protectedCampaignRoutes = new Hono<AppEnv>()
  .get("/w/:wid/protected-campaigns", ...member("viewer"), async (c) =>
    c.json(
      await listProtectedCampaigns(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, paginationQuerySchema),
      ),
    ),
  )
  .put(
    "/w/:wid/protected-campaigns/:campaignId",
    ...member("editor"),
    async (c) => {
      const campaignId = metaIdParam(c.req.param("campaignId"));
      const input = await parseJson(c, protectCampaignRequestSchema);
      await protectCampaign(
        c.env,
        c.get("scope")!,
        campaignId,
        input,
        c.get("requestId"),
      );
      return c.body(null, 204);
    },
  )
  .delete(
    "/w/:wid/protected-campaigns/:campaignId",
    ...member("editor"),
    async (c) => {
      await unprotectCampaign(
        c.env.DB,
        c.get("scope")!,
        metaIdParam(c.req.param("campaignId")),
        c.get("requestId"),
      );
      return c.body(null, 204);
    },
  );
