import type { TenancyParams } from "../helpers/security-probes";
import type { TenantPair } from "../helpers/tenant-pair";

const foreignMember = ({ B }: TenantPair) => ({
  params: { userId: B.users.viewer.id },
});

const foreignInvitation = ({ B }: TenantPair) => ({
  params: { id: B.invitation.id },
});

const foreignProduct = ({ B }: TenantPair) => ({
  params: { id: B.product.id },
});

export const TENANCY_PARAMS: TenancyParams = {
  "PATCH /api/w/:wid/members/:userId": (pair) => ({
    ...foreignMember(pair),
    body: { role: "viewer" },
  }),
  "DELETE /api/w/:wid/members/:userId": foreignMember,
  "DELETE /api/w/:wid/invitations/:id": foreignInvitation,
  "GET /api/w/:wid/products/:id": foreignProduct,
  "PATCH /api/w/:wid/products/:id": (pair) => ({
    ...foreignProduct(pair),
    body: { name: "Hijack" },
  }),
  "POST /api/w/:wid/products/:id/duplicate": foreignProduct,
  "POST /api/w/:wid/products/:id/archive": (pair) => ({
    ...foreignProduct(pair),
    body: { archived: true },
  }),
};
