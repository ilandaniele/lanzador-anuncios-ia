import {
  createChatSession,
  createInvitation,
  createLaunch,
  createMetaAsset,
  createMetaConnection,
  createPilotProposal,
  createProduct,
  createProductCopy,
  createUpload,
  createUser,
  createWorkspace,
} from "./factory";

const sealingKeys = {
  TOKEN_ENC_KEY_CURRENT: 1,
  TOKEN_ENC_KEY_V1: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};

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
  const [{ invitation }, product, launch, connection, chatSession] =
    await Promise.all([
      createInvitation(tenant.workspace.id, {
        invitedBy: tenant.users.admin.id,
      }),
      createProduct(tenant.workspace.id),
      createLaunch(tenant.workspace.id),
      createMetaConnection(
        sealingKeys,
        tenant.workspace.id,
        "tenant-seed-token",
      ),
      createChatSession(tenant.workspace.id, tenant.users.owner.id),
    ]);
  const adAccount = await createMetaAsset(tenant.workspace.id, connection.id);
  const [copy, proposal] = await Promise.all([
    createProductCopy(tenant.workspace.id, product.id),
    createPilotProposal(tenant.workspace.id, adAccount.metaId),
  ]);
  const { creative, upload } = await createUpload(
    tenant.workspace.id,
    adAccount.id,
  );
  return {
    ...tenant,
    invitation,
    product,
    launch,
    connection,
    chatSession,
    adAccount,
    copy,
    proposal,
    creative,
    upload,
  };
}

export async function seedTenantPair() {
  const [A, B] = await Promise.all([seedTenant(), seedTenant()]);
  return { A, B };
}

export type TenantPair = Awaited<ReturnType<typeof seedTenantPair>>;
