import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

const migrationsDir = "src/db/migrations";
const migrations = existsSync(migrationsDir)
  ? await readD1Migrations(migrationsDir)
  : [];

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          TOKEN_ENC_KEY_V1: "dGVzdC10b2tlbi1lbmNyeXB0aW9uLWtleS0zMmJ5dGU=",
          META_APP_SECRET: "test-app-secret",
          MP_ACCESS_TOKEN: "test-mp-access-token",
          MP_WEBHOOK_SECRET: "test-mp-webhook-secret",
          APP_ORIGIN: "http://localhost:5173",
        },
      },
    }),
  ],
  test: {
    name: "workers",
    include: ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["tests/unit/eslint-boundaries.test.ts"],
    setupFiles: ["tests/setup/apply-migrations.ts", "tests/setup/msw.ts"],
  },
});
