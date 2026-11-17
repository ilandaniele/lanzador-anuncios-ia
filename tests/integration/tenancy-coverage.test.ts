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

const PENDING_TABLES = [
  "aiUsage",
  "auditLog",
  "chatMessages",
  "chatSessions",
  "creatives",
  "errorEvents",
  "googleConnections",
  "insightsCache",
  "invitations",
  "launchItems",
  "launches",
  "memberships",
  "metaAssets",
  "metaConnections",
  "oauthStates",
  "pilotProposals",
  "pilotRules",
  "pilotRuns",
  "productCopies",
  "products",
  "protectedCampaigns",
  "uploads",
  "workspaceSettings",
];

describe("tenancy coverage", () => {
  it("finds the tenant tables", () => {
    expect(tenantTables.length).toBeGreaterThan(20);
  });

  it("covers every tenant table with an inWorkspace repository", () => {
    const uncovered = tenantTables.filter((name) => !isCovered(name));

    expect(uncovered.filter((name) => !PENDING_TABLES.includes(name))).toEqual(
      [],
    );
  });

  it("drops covered tables from PENDING_TABLES", () => {
    expect(PENDING_TABLES.filter(isCovered)).toEqual([]);
  });

  it("lists only tenant tables in PENDING_TABLES", () => {
    expect(
      PENDING_TABLES.filter((name) => !tenantTables.includes(name)),
    ).toEqual([]);
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
