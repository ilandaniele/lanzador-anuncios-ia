import { users } from "../schema/auth";
import { products } from "../schema/products";
import { invitations, memberships, workspaces } from "../schema/workspaces";

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

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const buildInvitation = (
  overrides: Pick<
    typeof invitations.$inferInsert,
    "workspaceId" | "tokenHash"
  > &
    Partial<typeof invitations.$inferInsert>,
): typeof invitations.$inferInsert => {
  const id = crypto.randomUUID();
  const at = Date.now();
  return {
    id,
    email: `${id}@example.test`,
    role: "editor",
    createdAt: at,
    expiresAt: at + INVITATION_TTL_MS,
    ...overrides,
  };
};

export const buildProduct = (
  overrides: Pick<typeof products.$inferInsert, "workspaceId"> &
    Partial<typeof products.$inferInsert>,
): typeof products.$inferInsert => {
  const id = crypto.randomUUID();
  const at = Date.now();
  const name = overrides.name ?? `Producto ${id}`;
  return {
    id,
    name,
    nameNormalized: name.trim().toLowerCase(),
    landingUrl: "https://tienda.example.test/producto",
    primaryText: "Texto principal",
    headline: "Titular",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
};
