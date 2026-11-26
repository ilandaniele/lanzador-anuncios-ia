import { Hono } from "hono";
import { subscribeRequestSchema } from "../../shared/schemas/billing";
import { parseJson } from "../lib/validate";
import { member } from "../middleware/member";
import { expensiveRateLimit } from "../middleware/rate-limit";
import { cancelSubscriptions } from "../services/billing/cancel";
import { getBillingOverview } from "../services/billing/overview";
import { subscribeToPlan } from "../services/billing/subscribe";
import { handleMercadoPagoWebhook } from "../services/billing/webhook";
import type { AppEnv } from "../types";

const billingOwner = member("owner", { billingExempt: true });

export const billingRoutes = new Hono<AppEnv>()
  .get("/w/:wid/billing", ...billingOwner, async (c) =>
    c.json(await getBillingOverview(c.env.DB, c.get("scope")!)),
  )
  .post(
    "/w/:wid/billing/subscribe",
    ...billingOwner,
    expensiveRateLimit,
    async (c) => {
      const { planId } = await parseJson(c, subscribeRequestSchema);
      return c.json(
        await subscribeToPlan(
          c.env,
          c.get("scope")!,
          c.get("user")!,
          planId,
          c.get("requestId"),
        ),
        201,
      );
    },
  )
  .post(
    "/w/:wid/billing/cancel",
    ...billingOwner,
    expensiveRateLimit,
    async (c) => {
      await cancelSubscriptions(c.env, c.get("scope")!, c.get("requestId"));
      return c.body(null, 204);
    },
  )
  .post("/billing/mercadopago/webhook", async (c) =>
    c.json(
      await handleMercadoPagoWebhook(
        c.env,
        {
          signature: c.req.header("x-signature"),
          providerRequestId: c.req.header("x-request-id"),
          dataId: c.req.query("data.id"),
          topic: c.req.query("type") ?? c.req.query("topic"),
        },
        c.get("requestId"),
      ),
    ),
  );
