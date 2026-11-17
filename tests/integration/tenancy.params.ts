import type { TenancyParams } from "../helpers/security-probes";
import type { TenantPair } from "../helpers/tenant-pair";

const foreignMember = ({ B }: TenantPair) => ({
  params: { userId: B.users.viewer.id },
});

export const TENANCY_PARAMS: TenancyParams = {
  "PATCH /api/w/:wid/members/:userId": (pair) => ({
    ...foreignMember(pair),
    body: { role: "viewer" },
  }),
  "DELETE /api/w/:wid/members/:userId": foreignMember,
};
