import { expect, test } from "@playwright/test";

test("home without session redirects to login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(
    page.getByRole("heading", { name: "Ingresá a Lanzador" }),
  ).toBeVisible();
});

test("api health responds ok", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ ok: true });
});

test("spa response carries the CSP header", async ({ request }) => {
  const response = await request.get("/");
  const csp = response.headers()["content-security-policy"];

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("img-src 'self' data: blob: https://*.fbcdn.net");
  expect(csp).toContain("frame-ancestors 'none'");
});

test("legal pages are served", async ({ request }) => {
  for (const path of ["/privacidad", "/terminos"]) {
    const response = await request.get(path);

    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("<h1>");
  }
});

test("robots.txt blocks the api", async ({ request }) => {
  const response = await request.get("/robots.txt");

  expect(await response.text()).toContain("Disallow: /api/");
});
