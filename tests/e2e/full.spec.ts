import { expect } from "@playwright/test";
import { getJson, workspaceApi } from "./helpers/api";
import {
  FOREIGN_WORKSPACE_ID,
  OWNER_EMAIL,
  signedInAs,
  SUPERADMIN_EMAIL,
  WORKSPACE_ID,
} from "./helpers/session";

const owner = signedInAs(OWNER_EMAIL);
const superadmin = signedInAs(SUPERADMIN_EMAIL);

owner.describe("owner tour across the milestones", () => {
  owner.describe.configure({ mode: "serial" });

  owner("lands on Hoy with accounts and alerts", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(new RegExp(`/w/${WORKSPACE_ID}/hoy$`));
    await expect(page.getByText("Gasto de hoy")).toBeVisible();
    await expect(page.getByText("Alertas")).toBeVisible();
  });

  owner(
    "navigates to the metrics of the seeded campaigns",
    async ({ page }) => {
      await page.goto(`/w/${WORKSPACE_ID}/hoy`);

      await page.getByRole("link", { name: "Métricas" }).first().click();

      await expect(
        page.getByRole("heading", { name: "Métricas", level: 1 }),
      ).toBeVisible();
      await expect(page.getByText("CBO Ganadora").first()).toBeVisible();
    },
  );

  owner("reviews pilot proposals and rules", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/metricas`);

    await page.getByRole("link", { name: "Piloto" }).first().click();
    await expect(page.getByText("CBO Ganadora").first()).toBeVisible();
    await page.getByRole("tab", { name: "Reglas" }).click();

    await expect(
      page.getByRole("list", { name: "Reglas del piloto" }),
    ).toBeVisible();
  });

  owner("opens a verified launch from the history", async ({ page }) => {
    await page.goto(`/w/${WORKSPACE_ID}/piloto`);

    await page.getByRole("link", { name: "Historial" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Historial", level: 1 }),
    ).toBeVisible();
    await page.goto(`/w/${WORKSPACE_ID}/lanzador/seed-launch-ok-a`);

    await expect(
      page.getByRole("heading", { name: /Lanzamiento: .*seed ok/ }),
    ).toBeVisible();
  });

  owner("opens the ai chat from the shell", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/w/${WORKSPACE_ID}/hoy`);

    await page.getByRole("button", { name: /Pedile a la IA/ }).click();

    await expect(
      page.getByRole("complementary", { name: "Chat con la IA" }),
    ).toBeVisible();
  });

  owner("workspace B stays out of reach", async ({ request, page }) => {
    const response = await request.get(
      workspaceApi("/metrics?range=last_7d", FOREIGN_WORKSPACE_ID),
    );
    expect([403, 404]).toContain(response.status());

    await page.goto(`/w/${FOREIGN_WORKSPACE_ID}/hoy`);

    await expect(
      page.getByRole("heading", { name: "No encontramos esta página" }),
    ).toBeVisible();
  });
});

superadmin.describe("superadmin console", () => {
  superadmin.beforeEach(async ({ request }) => {
    const { user } = await getJson<{ user: { isSuperadmin: boolean } }>(
      request,
      "/api/me",
    );
    superadmin.skip(
      !user.isSuperadmin,
      `SUPERADMIN_EMAIL is not ${SUPERADMIN_EMAIL} in this environment`,
    );
  });

  superadmin("lists both seeded workspaces", async ({ request }) => {
    const { data } = await getJson<{ data: { id: string; name: string }[] }>(
      request,
      "/api/admin/workspaces",
    );

    expect(data.map(({ id }) => id)).toEqual(
      expect.arrayContaining([WORKSPACE_ID, FOREIGN_WORKSPACE_ID]),
    );
  });

  superadmin("shows the admin page and platform usage", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Administración", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Marca Demo").first()).toBeVisible();

    await page.goto("/admin/uso");

    await expect(
      page.getByRole("heading", { name: "Uso de la plataforma" }),
    ).toBeVisible();
  });
});
