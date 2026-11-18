import { Hono } from "hono";
import {
  objectStatusRequestSchema,
  scaleCampaignRequestSchema,
} from "../../shared/schemas/meta-actions";
import { parseJson } from "../lib/validate";
import { member } from "../middleware/member";
import { scaleCampaign, setObjectStatus } from "../services/meta/actions";
import type { AppEnv } from "../types";
import { metaIdParam } from "./meta-campaigns";

export const metaActionRoutes = new Hono<AppEnv>()
  .post(
    "/w/:wid/meta/objects/:objectId/status",
    ...member("editor"),
    async (c) => {
      const objectId = metaIdParam(c.req.param("objectId"));
      const input = await parseJson(c, objectStatusRequestSchema);
      return c.json(
        await setObjectStatus(
          c.env,
          c.get("scope")!,
          objectId,
          input,
          c.get("requestId"),
        ),
      );
    },
  )
  .post(
    "/w/:wid/meta/campaigns/:campaignId/scale",
    ...member("editor"),
    async (c) => {
      const campaignId = metaIdParam(c.req.param("campaignId"));
      const input = await parseJson(c, scaleCampaignRequestSchema);
      return c.json(
        await scaleCampaign(
          c.env,
          c.get("scope")!,
          campaignId,
          input,
          c.get("requestId"),
        ),
      );
    },
  );
