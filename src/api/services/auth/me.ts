import { isBillingBlocked } from "../../../shared/billing";
import type { Me } from "../../../shared/schemas/auth";
import { now } from "../../lib/time";
import { toBillingState } from "../../repositories/billing-access";
import { listUserWorkspaces } from "../../repositories/users";

export async function getMe(db: D1Database, user: Me["user"]): Promise<Me> {
  const at = now();
  const workspaces = await listUserWorkspaces(db, user.id);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperadmin: user.isSuperadmin,
    },
    workspaces: workspaces.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
      billingBlocked: isBillingBlocked(toBillingState(row), at),
    })),
  };
}
