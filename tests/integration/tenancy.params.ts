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

const foreignLaunch = ({ B }: TenantPair) => ({
  params: { id: B.launch.id },
});

const foreignConnection = ({ B }: TenantPair) => ({
  params: { id: B.connection.id },
});

const foreignChatSession = ({ B }: TenantPair) => ({
  params: { id: B.chatSession.id },
});

export const TENANCY_PARAMS: TenancyParams = {
  "GET /api/w/:wid/chat/sessions/:id/messages": foreignChatSession,
  "POST /api/w/:wid/meta/connections/:id/refresh-assets": foreignConnection,
  "DELETE /api/w/:wid/meta/connections/:id": (pair) => ({
    ...foreignConnection(pair),
    body: { confirm: true },
  }),
  "GET /api/w/:wid/meta/ad-accounts/:assetId/campaigns": ({ B }) => ({
    params: { assetId: B.adAccount.id },
  }),
  "GET /api/w/:wid/meta/campaigns/:campaignId/reference": ({ B }) => ({
    params: { campaignId: "120200000000000001" },
    query: { adAccountAssetId: B.adAccount.id },
  }),
  "GET /api/w/:wid/meta/campaigns/:campaignId/ads": ({ B }) => ({
    params: { campaignId: "120200000000000001" },
    query: { adAccountAssetId: B.adAccount.id },
  }),
  "GET /api/w/:wid/meta/ads/:adId/preview": ({ B }) => ({
    params: { adId: "120200000000000002" },
    query: { adAccountAssetId: B.adAccount.id },
  }),
  "GET /api/w/:wid/launches/:id": foreignLaunch,
  "PATCH /api/w/:wid/launches/:id": (pair) => ({
    ...foreignLaunch(pair),
    body: { draft: {} },
  }),
  "POST /api/w/:wid/launches/:id/discard": foreignLaunch,
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
  "POST /api/w/:wid/products/:id/check-landing": foreignProduct,
  "POST /api/w/:wid/products/:id/archive": (pair) => ({
    ...foreignProduct(pair),
    body: { archived: true },
  }),
};
