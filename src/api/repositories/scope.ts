import { eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Role } from "../../shared/constants";

export type Scope = { workspaceId: string; userId: string; role: Role };

export const inWorkspace = (
  table: { workspaceId: SQLiteColumn },
  scope: Scope,
): SQL => eq(table.workspaceId, scope.workspaceId);
