import type { ReactNode } from "react";
import { t } from "../i18n/es-AR";
import { Button } from "./Button";
import { cx, focusRing } from "./classes";
import { Skeleton } from "./Skeleton";

const SKELETON_ROWS = 8;

export type SortDirection = "ascending" | "descending";
export type Sort = { key: string; direction: SortDirection };

export type Column<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  rowHeader?: boolean;
};

type DataTableProps<Row> = {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  sort?: Sort | null;
  onSortChange?: (sort: Sort | null) => void;
  loading?: boolean;
  updating?: boolean;
  error?: string;
  onRetry?: () => void;
  empty?: ReactNode;
};

function nextSort(current: Sort | null | undefined, key: string): Sort | null {
  if (current?.key !== key) return { key, direction: "ascending" };
  return current.direction === "ascending"
    ? { key, direction: "descending" }
    : null;
}

function StatusRow({ span, children }: { span: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="px-3 py-6 text-center text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  sort,
  onSortChange,
  loading,
  updating,
  error,
  onRetry,
  empty = t("table.empty"),
}: DataTableProps<Row>) {
  const span = columns.length;

  return (
    <div className="overflow-x-auto">
      <table aria-busy={loading || updating || undefined} className="w-full">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface shadow-[0_1px_0_var(--color-rule)]">
          <tr>
            {columns.map((column) => {
              const direction =
                sort?.key === column.key ? sort.direction : undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    column.sortable ? (direction ?? "none") : undefined
                  }
                  className={cx(
                    "px-3 py-3 font-semibold",
                    column.numeric ? "text-right" : "text-left",
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange?.(nextSort(sort, column.key))}
                      className={cx(
                        "inline-flex items-center gap-1",
                        focusRing,
                      )}
                    >
                      {column.header}
                      <span aria-hidden="true">
                        {direction === "ascending"
                          ? "↑"
                          : direction === "descending"
                            ? "↓"
                            : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
          {updating && (
            <tr aria-hidden="true">
              <th colSpan={span} className="h-0.5 bg-primary p-0" />
            </tr>
          )}
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <tr key={index} className="border-t border-rule">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <Skeleton />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && error && (
            <StatusRow span={span}>
              <p role="alert" className="mb-2 text-loss">
                {error}
              </p>
              {onRetry && (
                <Button variant="secondary" onClick={onRetry}>
                  {t("errors.retry")}
                </Button>
              )}
            </StatusRow>
          )}
          {!loading && !error && rows.length === 0 && (
            <StatusRow span={span}>{empty}</StatusRow>
          )}
          {!loading &&
            !error &&
            rows.map((row) => (
              <tr key={getRowKey(row)} className="border-t border-rule">
                {columns.map((column) => {
                  const className = cx(
                    "px-3 py-3",
                    column.numeric ? "text-right tabular-nums" : "text-left",
                  );
                  return column.rowHeader ? (
                    <th
                      key={column.key}
                      scope="row"
                      className={cx(className, "font-normal")}
                    >
                      {column.render(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={className}>
                      {column.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
