/// <reference types="vite/client" />
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

const schemaModules = import.meta.glob("/src/db/schema/*.ts", { eager: true });
const repositorySources = import.meta.glob("/src/api/repositories/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const apiSources = import.meta.glob(
  ["/src/api/**/*.ts", "/src/workflows/**/*.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const tenantTables = Object.values(schemaModules)
  .flatMap((module) => Object.entries(module as Record<string, unknown>))
  .filter(
    ([, value]) =>
      is(value, SQLiteTable) &&
      getTableConfig(value).columns.some(
        (column) => column.name === "workspace_id",
      ),
  )
  .map(([exportName]) => exportName)
  .sort();

const IMPORTS_IN_WORKSPACE = /import\s[^;]*\binWorkspace\b[^;]*from/;

const isCoveredBy = (sources: string[], exportName: string) =>
  sources
    .filter((source) => IMPORTS_IN_WORKSPACE.test(source))
    .some((source) =>
      new RegExp(String.raw`\binWorkspace\(\s*${exportName}\b`).test(source),
    );

const isCovered = (exportName: string) =>
  isCoveredBy(Object.values(repositorySources), exportName);

const PENDING_TABLES: string[] = [];

const UNSCOPED_TABLES: Record<string, { reason: string; readers: string[] }> = {
  aiUsage: {
    reason: "append-only ledger, never read back per row",
    readers: [],
  },
  errorEvents: {
    reason: "read only by the superadmin panel and purged by cron",
    readers: [
      "/src/api/repositories/error-events.ts",
      "/src/api/repositories/maintenance.ts",
    ],
  },
  oauthStates: {
    reason: "claimed once by state hash and user, purged by cron",
    readers: [
      "/src/api/repositories/maintenance.ts",
      "/src/api/repositories/oauth-states.ts",
    ],
  },
};
const unscopedTables = Object.keys(UNSCOPED_TABLES);

const readsTable = (source: string, exportName: string) =>
  new RegExp(
    String.raw`\.(from|update|delete|\w+Join)\(\s*${exportName}\b`,
  ).test(source);

const readersOf = (exportName: string) =>
  Object.entries(apiSources)
    .filter(([, source]) => readsTable(source, exportName))
    .map(([path]) => path)
    .sort();

describe("tenancy coverage", () => {
  it("finds the tenant tables", () => {
    expect(tenantTables.length).toBeGreaterThan(20);
  });

  it("covers every tenant table with an inWorkspace repository", () => {
    const uncovered = tenantTables.filter((name) => !isCovered(name));

    expect(
      uncovered.filter(
        (name) =>
          !PENDING_TABLES.includes(name) && !unscopedTables.includes(name),
      ),
    ).toEqual([]);
  });

  it("drops covered tables from PENDING_TABLES", () => {
    expect(PENDING_TABLES.filter(isCovered)).toEqual([]);
  });

  it("lists only tenant tables in PENDING_TABLES", () => {
    expect(
      PENDING_TABLES.filter((name) => !tenantTables.includes(name)),
    ).toEqual([]);
  });

  it("has no pending tables left", () => {
    expect(PENDING_TABLES).toEqual([]);
  });

  describe("tables without a tenant-scoped read", () => {
    it("lists only uncovered tenant tables", () => {
      expect(
        unscopedTables.filter(
          (name) => !tenantTables.includes(name) || isCovered(name),
        ),
      ).toEqual([]);
    });

    it.each(unscopedTables)("%s is read only by its declared files", (name) => {
      expect(readersOf(name)).toEqual(UNSCOPED_TABLES[name]?.readers);
    });

    it("detects reads, updates, deletes and joins but not inserts", () => {
      const reads = [
        ".from(aiUsage)",
        ".update( aiUsage)",
        ".delete(aiUsage)",
        ".leftJoin(aiUsage,",
      ];

      expect(reads.filter((source) => !readsTable(source, "aiUsage"))).toEqual(
        [],
      );
      expect(readsTable(".insert(aiUsage)", "aiUsage")).toBe(false);
      expect(readsTable(".from(aiUsageDaily)", "aiUsage")).toBe(false);
    });
  });

  describe("detector self-check", () => {
    const source = `import { inWorkspace } from "./scope";
where(inWorkspace(products, scope))`;

    it("detects a table scoped through inWorkspace", () => {
      expect(isCoveredBy([source], "products")).toBe(true);
    });

    it("ignores other tables and prefix matches", () => {
      expect(isCoveredBy([source], "launches")).toBe(false);
      expect(isCoveredBy([source], "product")).toBe(false);
    });

    it("ignores a source that does not import inWorkspace", () => {
      expect(isCoveredBy(["inWorkspace(products, scope)"], "products")).toBe(
        false,
      );
    });
  });
});
