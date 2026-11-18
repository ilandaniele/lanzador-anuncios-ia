import { expect } from "@playwright/test";
import { expectApiError, getJson, sendJson, workspaceApi } from "./helpers/api";
import {
  FOREIGN_WORKSPACE_ID,
  OWNER_EMAIL,
  signedInAs,
  WORKSPACE_ID,
} from "./helpers/session";

const test = signedInAs(OWNER_EMAIL);
const SEEDED_CAMPAIGNS = [
  "CBO Ganadora",
  "CBO Protegida",
  "CBO ROAS bajo",
  "CBO Sin ventas",
];

type MetricsRow = {
  name: string;
  spendMinor: number;
  purchases: number;
  roas: number | null;
  protected: boolean;
};

type MetricsResponse = {
  data: MetricsRow[];
  totals: { currency: string; spendMinor: number; purchases: number }[];
  updatedAt: string | null;
  nextCursor: string | null;
};

const metricsPath = (query: string) => workspaceApi(`/metrics?${query}`);

test.describe("metrics api", () => {
  test("lists the seeded campaigns with totals from cached insights", async ({
    request,
  }) => {
    const metrics = await getJson<MetricsResponse>(
      request,
      metricsPath("range=last_7d&limit=100"),
    );

    expect(metrics.data.map(({ name }) => name).sort()).toEqual(
      SEEDED_CAMPAIGNS,
    );
    expect(metrics.updatedAt).not.toBeNull();
    const [total] = metrics.totals;
    expect(total!.currency).toBe("USD");
    expect(total!.spendMinor).toBe(
      metrics.data.reduce((sum, { spendMinor }) => sum + spendMinor, 0),
    );
  });

  test("winner has the best roas and the protected campaign is flagged", async ({
    request,
  }) => {
    const { data } = await getJson<MetricsResponse>(
      request,
      metricsPath("range=last_7d&sort=roas:desc"),
    );

    expect(data[0]).toMatchObject({ name: "CBO Ganadora", roas: 4.13 });
    expect(data.find(({ name }) => name === "CBO Protegida")?.protected).toBe(
      true,
    );
  });

  test("search narrows the rows", async ({ request }) => {
    const { data } = await getJson<MetricsResponse>(
      request,
      metricsPath("range=last_7d&q=Sin%20ventas"),
    );

    expect(data.map(({ name }) => name)).toEqual(["CBO Sin ventas"]);
  });

  test("unknown range is a validation error", async ({ request }) => {
    const response = await request.get(metricsPath("range=bogus"));

    await expectApiError(response, 400, "VALIDATION");
  });

  test("csv export carries the header and the seeded rows", async ({
    request,
  }) => {
    const response = await request.get(
      workspaceApi("/metrics/export.csv?range=last_7d"),
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const csv = await response.text();
    expect(csv.split("\n")[0]).toContain("spendMinor");
    expect(csv).toContain("CBO Ganadora");
  });

  test("top ads and winning tags answer with lists", async ({ request }) => {
    const topAds = await getJson<{ data: unknown[] }>(
      request,
      workspaceApi("/metrics/top-ads?range=last_7d"),
    );
    const winning = await getJson<{ data: unknown[] }>(
      request,
      workspaceApi("/metrics/winning-tags?range=last_7d&dimension=hook"),
    );

    expect(Array.isArray(topAds.data)).toBe(true);
    expect(Array.isArray(winning.data)).toBe(true);
  });

  test("metrics of workspace B are not readable", async ({ request }) => {
    const response = await request.get(
      workspaceApi("/metrics?range=last_7d", FOREIGN_WORKSPACE_ID),
    );

    await expectApiError(response, 404, "NOT_FOUND");
  });

  test("refresh against meta needs a live connection", async ({
    request,
    origin,
  }) => {
    test.skip(
      !process.env.E2E_META_LIVE,
      "Needs a live Meta connection: set E2E_META_LIVE=1",
    );

    const response = await sendJson(
      request,
      "post",
      workspaceApi("/metrics/refresh"),
      origin,
      { range: "last_7d" },
    );

    expect(response.status()).toBe(200);
    expect(
      ((await response.json()) as { updatedAt: string }).updatedAt,
    ).toBeTruthy();
  });
});

test.describe("metrics and today pages", () => {
  test("metrics page shows the tabs and the seeded campaigns", async ({
    page,
  }) => {
    await page.goto(`/w/${WORKSPACE_ID}/metricas`);

    await expect(
      page.getByRole("heading", { name: "Métricas", level: 1 }),
    ).toBeVisible();
    for (const name of ["Rendimiento", "Mejores anuncios", "Qué gana"]) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }
    await expect(page.getByText("CBO Ganadora").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Exportar CSV" }),
    ).toBeVisible();
  });

  test("tabs switch without leaving the page", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/metricas`);

    await page.getByRole("tab", { name: "Qué gana" }).click();

    await expect(page.getByRole("tab", { name: "Qué gana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("today page summarises spend and alerts", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/hoy`);

    await expect(page.getByText("Gasto de hoy")).toBeVisible();
    await expect(page.getByText("Cuenta 1").first()).toBeVisible();
    await expect(page.getByText("Alertas")).toBeVisible();
  });
});
