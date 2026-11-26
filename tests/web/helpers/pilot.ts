import { http, HttpResponse } from "msw";
import type { Role } from "../../../src/shared/constants";
import type { Me } from "../../../src/shared/schemas/auth";
import type { AssetDto } from "../../../src/shared/schemas/meta-connections";
import type { PilotProposalDto } from "../../../src/shared/schemas/pilot";
import { server } from "../../helpers/msw/server";
import { WORKSPACE_ID } from "./launch-progress";

export const ACCOUNT_META_ID = "act_1";

export const proposalDto = (
  overrides: Partial<PilotProposalDto> = {},
): PilotProposalDto => ({
  id: "pr1",
  runId: "run1",
  ruleType: "pause_no_sales",
  action: "pause",
  adAccountId: ACCOUNT_META_ID,
  level: "campaign",
  objectId: "camp1",
  objectName: "Campaña floja",
  evidence: {
    range: "today",
    spendMinor: 4000,
    purchases: 0,
    roas: null,
    cpaMinor: null,
    targetCpaMinor: 2000,
    spendThresholdMinor: 4000,
  },
  currentBudgetMinor: null,
  proposedBudgetMinor: null,
  percent: null,
  explanation: "Gastó el doble del CPA objetivo sin vender",
  status: "pending",
  resultMessage: null,
  launchId: null,
  decidedAt: null,
  expiresAt: "2026-01-02T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

export const scaleProposalDto = (
  overrides: Partial<PilotProposalDto> = {},
): PilotProposalDto =>
  proposalDto({
    id: "pr2",
    ruleType: "scale_winner",
    action: "scale",
    objectName: "Campaña ganadora",
    evidence: {
      range: "daily:last_3d",
      spendMinor: 15000,
      purchases: 9,
      roas: 3.4,
      cpaMinor: 1666,
      minRoas: 2.4,
    },
    currentBudgetMinor: 5000,
    proposedBudgetMinor: 6000,
    percent: 20,
    ...overrides,
  });

const meAs = (role: Role): Me => ({
  user: {
    id: "u1",
    email: "ana@example.com",
    name: "Ana",
    isSuperadmin: false,
  },
  workspaces: [
    {
      id: WORKSPACE_ID,
      name: "Mi negocio",
      role,
      status: "active",
      billingBlocked: false,
    },
  ],
});

const adAccount: AssetDto = {
  id: "asset1",
  kind: "ad_account",
  metaId: ACCOUNT_META_ID,
  name: "Cuenta Uno",
  parentMetaId: null,
  currency: "USD",
  enabled: true,
  health: {
    accountStatus: null,
    disableReason: null,
    fundingOk: null,
    spendCapPct: null,
    checkedAt: null,
  },
};

export function usePilotContext(role: Role = "editor") {
  server.use(
    http.get("/api/me", () => HttpResponse.json(meAs(role))),
    http.get(`/api/w/${WORKSPACE_ID}/meta/assets`, () =>
      HttpResponse.json({ data: [adAccount], nextCursor: null }),
    ),
  );
}
