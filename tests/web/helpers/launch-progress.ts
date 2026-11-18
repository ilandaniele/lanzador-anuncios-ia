import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import type {
  LaunchDto,
  LaunchProgress,
} from "../../../src/shared/schemas/launch";
import { server } from "../../helpers/msw/server";

export const WORKSPACE_ID = "w1";
export const LAUNCH_ID = "l1";

const launchApi = `/api/w/${WORKSPACE_ID}/launches/${LAUNCH_ID}`;

export const launchDto = (overrides: Partial<LaunchDto> = {}): LaunchDto => ({
  id: LAUNCH_ID,
  status: "paused_verified",
  phase: null,
  source: "manual",
  mode: "new_cbo",
  adAccountAssetId: "a1",
  currency: "USD",
  productId: "p1",
  draft: { campaignName: "Campaña Combo" },
  planHash: "hash1",
  dailyBudgetMinor: 2000,
  startAt: null,
  metaCampaignUrl: "https://adsmanager.facebook.com/campaigns?id=1",
  itemsTotal: 2,
  itemsDone: 2,
  itemsFailed: 0,
  checksOk: true,
  errorCode: null,
  errorMessage: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  activatedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

export const progressDto = (
  overrides: Partial<LaunchProgress> = {},
): LaunchProgress => ({
  status: "paused_verified",
  phase: null,
  counts: { total: 2, done: 2, failed: 0 },
  items: [
    { id: "i1", position: 0, status: "done", adName: "Video uno" },
    { id: "i2", position: 1, status: "done", adName: "Video dos" },
  ],
  checks: [{ ok: true, code: "ADS_PAUSED", text: "Anuncios en pausa" }],
  updatedAt: "2026-01-01T00:00:00.000Z",
  nextPollMs: null,
  ...overrides,
});

export function useLaunchBackend(
  progress: () => LaunchProgress,
  launch: LaunchDto = launchDto(),
) {
  const progressCalls = vi.fn();
  server.use(
    http.get(launchApi, () =>
      HttpResponse.json({ launch, items: [], checks: null, plan: null }),
    ),
    http.get(`${launchApi}/progress`, () => {
      progressCalls();
      return HttpResponse.json(progress());
    }),
  );
  return progressCalls;
}

export function useLaunchPost(action: string, status = 202) {
  const received = vi.fn();
  server.use(
    http.post(`${launchApi}/${action}`, async ({ request }) => {
      received(await request.json());
      return HttpResponse.json({ status: "queued" }, { status });
    }),
  );
  return received;
}
