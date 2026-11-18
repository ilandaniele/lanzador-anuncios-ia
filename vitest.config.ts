import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "vitest.workers.config.ts",
      {
        extends: "./vite.config.ts",
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["tests/setup/web.ts"],
          testTimeout: 15000,
          include: [
            "tests/web/**/*.test.{ts,tsx}",
            "tests/unit/eslint-boundaries.test.ts",
          ],
        },
      },
    ],
  },
});
