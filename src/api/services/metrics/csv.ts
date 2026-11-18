import type { MetricsRow } from "./aggregate";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const LINE_BREAK = "\r\n";

const COLUMNS = [
  "id",
  "name",
  "level",
  "status",
  "adAccountId",
  "currency",
  "spendMinor",
  "purchases",
  "purchaseValueMinor",
  "roas",
  "cpaMinor",
  "ctr",
  "cpmMinor",
] as const satisfies readonly (keyof MetricsRow)[];

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: MetricsRow[]): string {
  const lines = [
    COLUMNS.join(","),
    ...rows.map((row) =>
      COLUMNS.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  return lines.join(LINE_BREAK) + LINE_BREAK;
}
