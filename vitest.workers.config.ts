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
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    name: "workers",
    include: ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["tests/unit/eslint-boundaries.test.ts"],
    setupFiles: ["tests/setup/apply-migrations.ts"],
  },
});
