import type { Me } from "../../../shared/schemas/auth";
import { listUserWorkspaces } from "../../repositories/users";

export async function getMe(db: D1Database, user: Me["user"]): Promise<Me> {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperadmin: user.isSuperadmin,
    },
    workspaces: await listUserWorkspaces(db, user.id),
  };
}
