import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/schemas/common";
import {
  memberRoleRequestSchema,
  transferOwnershipRequestSchema,
} from "../../shared/schemas/members";
import { parseJson, parseQuery } from "../lib/validate";
import { member, memberOrSelf } from "../middleware/member";
import {
  changeMemberRole,
  listMembers,
  removeMember,
  transferWorkspaceOwnership,
} from "../services/members";
import type { AppEnv } from "../types";

export const memberRoutes = new Hono<AppEnv>()
  .get("/w/:wid/members", ...member("viewer"), async (c) =>
    c.json(
      await listMembers(
        c.env.DB,
        c.get("scope")!,
        parseQuery(c, paginationQuerySchema),
      ),
    ),
  )
  .patch("/w/:wid/members/:userId", ...member("admin"), async (c) => {
    const { role } = await parseJson(c, memberRoleRequestSchema);
    return c.json(
      await changeMemberRole(
        c.env.DB,
        c.get("scope")!,
        { userId: c.req.param("userId"), role },
        c.get("requestId"),
      ),
    );
  })
  .delete(
    "/w/:wid/members/:userId",
    ...memberOrSelf("admin", "userId"),
    async (c) => {
      await removeMember(
        c.env.DB,
        c.get("scope")!,
        c.req.param("userId"),
        c.get("requestId"),
      );
      return c.body(null, 204);
    },
  )
  .post("/w/:wid/transfer-ownership", ...member("owner"), async (c) => {
    const { userId } = await parseJson(c, transferOwnershipRequestSchema);
    return c.json(
      await transferWorkspaceOwnership(
        c.env.DB,
        c.get("scope")!,
        userId,
        c.get("requestId"),
      ),
    );
  });
