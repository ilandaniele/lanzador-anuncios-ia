import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

const builder = drizzle(async () => ({ rows: [] }));

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  throw new Error(`Cannot render SQL literal for ${typeof value}`);
}

export function renderInsertOrIgnore<T extends SQLiteTable>(
  table: T,
  rows: T["$inferInsert"][],
): string {
  if (rows.length === 0) return "";
  const { sql, params } = builder
    .insert(table)
    .values(rows)
    .onConflictDoNothing()
    .toSQL();
  let next = 0;
  return `${sql.replaceAll("?", () => toSqlLiteral(params[next++]))};`;
}
