import { users } from "../schema/auth";
import { memberships, workspaces } from "../schema/workspaces";

export const buildUser = (
  overrides: Partial<typeof users.$inferInsert> = {},
): typeof users.$inferInsert => {
  const id = crypto.randomUUID();
  return {
    id,
    email: `${id}@example.test`,
    createdAt: Date.now(),
    ...overrides,
  };
};

export const buildWorkspace = (
  overrides: Pick<typeof workspaces.$inferInsert, "ownerUserId"> &
    Partial<typeof workspaces.$inferInsert>,
): typeof workspaces.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "Marca Demo",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};

export const buildMembership = (
  overrides: Pick<
    typeof memberships.$inferInsert,
    "workspaceId" | "userId" | "role"
  > &
    Partial<typeof memberships.$inferInsert>,
): typeof memberships.$inferInsert => {
  const at = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};
