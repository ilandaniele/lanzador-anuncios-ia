import { expect, type APIRequestContext } from "@playwright/test";
import { workspaceApi } from "./api";
import { csrfHeaders } from "./session";

const seedDraft = (label: string) => ({
  adAccountAssetId: "seed-asset-account-1-a",
  pixelId: "130000000000001",
  pageId: "110000000000001",
  mode: "new_cbo",
  productId: "seed-product-1-a",
  copy: {
    primaryText: "Texto principal de prueba",
    headline: "Titular de prueba",
    description: "Descripcion de prueba",
    cta: "SHOP_NOW",
  },
  items: [1, 2].map((n) => ({
    source: "upload",
    creativeId: `seed-creative-${n}-a`,
    adName: `Anuncio ${n}`,
    mediaKind: "image",
  })),
  dailyBudgetMinor: 5000,
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  countries: ["AR"],
  optimizationEvent: "PURCHASE",
  campaignName: `Campaña ${label}`,
  adsetName: `Conjunto ${label}`,
});

export async function createDraft(
  request: APIRequestContext,
  origin: string,
  label: string,
) {
  const response = await request.post(workspaceApi("/launches"), {
    headers: csrfHeaders(origin),
    data: { draft: seedDraft(label) },
  });
  expect(response.ok()).toBe(true);
  const { launch } = (await response.json()) as { launch: { id: string } };
  return launch.id;
}
