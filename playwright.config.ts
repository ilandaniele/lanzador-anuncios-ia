import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://localhost:8787";
const baseURL = process.env.E2E_BASE_URL ?? localBaseUrl;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "results",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx wrangler dev --port 8787 --var APP_ORIGIN:${localBaseUrl}`,
        url: `${localBaseUrl}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
