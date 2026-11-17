import { expect, test } from "@playwright/test";

test("home renders the app title", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Lanzador de anuncios" }),
  ).toBeVisible();
});

test("api health responds ok", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ ok: true });
});
