import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/schemas/common";
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
} from "../../shared/schemas/invitations";
import { parseJson, parseQuery } from "../lib/validate";
import { member } from "../middleware/member";
import { authRateLimit, requestIp } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeWorkspaceInvitation,
} from "../services/invitations";
import type { AppEnv } from "../types";

export const invitationRoutes = new Hono<AppEnv>()
  .get("/w/:wid/invitations", ...member("admin"), async (c) =>
    c.json(
      await listInvitations(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, paginationQuerySchema),
      ),
    ),
  )
  .post("/w/:wid/invitations", ...member("admin"), async (c) => {
    const input = await parseJson(c, createInvitationRequestSchema);
    return c.json(
      await createInvitation(
        c.env,
        c.get("scope")!,
        c.get("user")!,
        input,
        c.get("requestId"),
      ),
      201,
    );
  })
  .delete("/w/:wid/invitations/:id", ...member("admin"), async (c) => {
    await revokeWorkspaceInvitation(
      c.env.DB,
      c.get("scope")!,
      c.req.param("id"),
    );
    return c.body(null, 204);
  })
  .post(
    "/invitations/accept",
    authRateLimit,
    session({ required: false }),
    async (c) => {
      const { token } = await parseJson(c, acceptInvitationRequestSchema);
      const { result, cookie } = await acceptInvitation(
        c.env,
        token,
        c.get("user"),
        { userAgent: c.req.header("User-Agent"), ip: requestIp(c) },
        c.get("requestId"),
      );
      if (cookie) c.header("Set-Cookie", cookie, { append: true });
      return c.json(result);
    },
  );
