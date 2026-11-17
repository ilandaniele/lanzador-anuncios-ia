import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const schemaImportPatterns = [
  {
    group: ["**/db/schema", "**/db/schema/**"],
    message:
      "Only src/api/repositories/** may import src/db/schema. Use a repository.",
  },
];

const metaWriteImportPatterns = [
  {
    group: ["**/integrations/meta/write", "**/integrations/meta/write/**"],
    message: "chat and ai services must not import integrations/meta/write.",
  },
];

export default defineConfig(
  globalIgnores(["dist", "coverage", "results", ".wrangler", "node_modules"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/web/**/*.{ts,tsx}"],
    extends: [
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/repositories/**", "src/db/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: schemaImportPatterns }],
    },
  },
  {
    files: ["src/api/services/chat/**", "src/api/services/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...schemaImportPatterns, ...metaWriteImportPatterns] },
      ],
    },
  },
);
