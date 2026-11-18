import { expect } from "@playwright/test";
import { expectApiError, getJson, sendJson, workspaceApi } from "./helpers/api";
import { OWNER_EMAIL, signedInAs, WORKSPACE_ID } from "./helpers/session";

const test = signedInAs(OWNER_EMAIL);
const SEED_PRODUCT_PATH = "/products/seed-product-1-a";
const FOREIGN_PRODUCT_PATH = "/products/seed-product-1-b";
const COPY_VARIANTS = 5;
const UNUSABLE_MODEL_OUTPUT_STATUS = 502;
const MODEL_TIMEOUT_MS = 180_000;

type AiUsage = {
  neuronsToday: number;
  dailyCap: number;
  neuronsMonth: number;
  monthlyCap: number;
  globalExhausted: boolean;
};

type Copy = {
  id: string;
  productId: string;
  angle: string;
  source: string;
  status: string;
  primaryText: string;
  headline: string;
  policyRisk: string;
};

const budgetLeft = ({
  neuronsToday,
  dailyCap,
  neuronsMonth,
  monthlyCap,
  globalExhausted,
}: AiUsage) =>
  !globalExhausted && neuronsToday < dailyCap && neuronsMonth < monthlyCap;

test.describe("ai tagging and usage", () => {
  test("seeded creatives carry ai tags", async ({ request }) => {
    const { data } = await getJson<{
      data: { aiStatus: string; tags: { hook: string; language: string } }[];
    }>(request, workspaceApi("/creatives"));

    expect(data).toHaveLength(6);
    for (const creative of data) {
      expect(creative.aiStatus).toBe("done");
      expect(creative.tags.hook).toBeTruthy();
      expect(creative.tags.language).toBe("es");
    }
  });

  test("workspace overview reports ai usage against the caps", async ({
    request,
  }) => {
    const { aiUsage } = await getJson<{ aiUsage: AiUsage }>(
      request,
      workspaceApi(""),
    );

    expect(aiUsage.neuronsToday).toBeGreaterThan(0);
    expect(aiUsage.dailyCap).toBeGreaterThan(0);
    expect(aiUsage.monthlyCap).toBeGreaterThanOrEqual(aiUsage.dailyCap);
    expect(aiUsage.neuronsMonth).toBeGreaterThanOrEqual(aiUsage.neuronsToday);
  });

  test("creatives page lists the seeded creatives", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/creativos`);

    await expect(
      page.getByRole("heading", { name: "Creativos", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Creativo 1").first()).toBeVisible();
  });

  test("ai settings page shows the usage meters", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/ajustes/ia`);

    await expect(page.getByRole("heading", { name: "IA" })).toBeVisible();
    await expect(page.getByText("créditos de IA hoy")).toBeVisible();
    await expect(page.getByText("este mes")).toBeVisible();
  });
});

test.describe("ai copy generation", () => {
  test("generation rejects an unknown angle without calling the model", async ({
    request,
    origin,
  }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi(`${SEED_PRODUCT_PATH}/copies/generate`),
      origin,
      { angle: "inexistente" },
    );

    await expectApiError(response, 400, "VALIDATION");
  });

  test("generation on a product of workspace B is not found", async ({
    request,
    origin,
  }) => {
    const response = await sendJson(
      request,
      "post",
      workspaceApi(`${FOREIGN_PRODUCT_PATH}/copies/generate`),
      origin,
      { angle: "beneficio" },
    );

    await expectApiError(response, 404, "NOT_FOUND");
  });

  test("workers ai returns saved copy variants and they can be favorited", async ({
    request,
    origin,
  }) => {
    test.setTimeout(MODEL_TIMEOUT_MS);
    const { aiUsage } = await getJson<{ aiUsage: AiUsage }>(
      request,
      workspaceApi(""),
    );
    test.skip(!budgetLeft(aiUsage), "Workers AI daily budget is exhausted");

    const generate = () =>
      sendJson(
        request,
        "post",
        workspaceApi(`${SEED_PRODUCT_PATH}/copies/generate`),
        origin,
        { angle: "beneficio" },
      );
    let generated = await generate();
    if (generated.status() === UNUSABLE_MODEL_OUTPUT_STATUS) {
      generated = await generate();
    }
    expect(generated.status(), await generated.text()).toBe(200);
    const { data } = (await generated.json()) as { data: Copy[] };

    expect(data).toHaveLength(COPY_VARIANTS);
    for (const copy of data) {
      expect(copy).toMatchObject({
        productId: "seed-product-1-a",
        angle: "beneficio",
        source: "ai",
        status: "suggested",
      });
      expect(copy.primaryText.length).toBeGreaterThan(0);
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(["none", "low", "high"]).toContain(copy.policyRisk);
    }

    const favorited = await sendJson(
      request,
      "patch",
      workspaceApi(`/copies/${data[0]!.id}`),
      origin,
      { favorite: true },
    );
    expect(favorited.status()).toBe(200);
    const listed = await getJson<{ data: Copy[] }>(
      request,
      workspaceApi(`${SEED_PRODUCT_PATH}/copies?limit=100`),
    );
    expect(listed.data.map(({ id }) => id)).toContain(data[0]!.id);
  });
});
