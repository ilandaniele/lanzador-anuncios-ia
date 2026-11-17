import { createInvitation, createUser, createWorkspace } from "./factory";

export async function seedWorkspaceWithRoles() {
  const [owner, admin, editor, viewer] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser(),
  ]);
  const { workspace } = await createWorkspace({
    owner,
    members: [
      { user: admin, role: "admin" },
      { user: editor, role: "editor" },
      { user: viewer, role: "viewer" },
    ],
  });
  return { workspace, users: { owner, admin, editor, viewer } };
}

async function seedTenant() {
  const tenant = await seedWorkspaceWithRoles();
  const { invitation } = await createInvitation(tenant.workspace.id, {
    invitedBy: tenant.users.admin.id,
  });
  return { ...tenant, invitation };
}

export async function seedTenantPair() {
  const [A, B] = await Promise.all([seedTenant(), seedTenant()]);
  return { A, B };
}

export type TenantPair = Awaited<ReturnType<typeof seedTenantPair>>;
