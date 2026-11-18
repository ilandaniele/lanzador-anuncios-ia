import type { ComponentProps } from "react";
import { cx } from "./classes";
import type { Column } from "./DataTable";

type DataTableRowProps<Row> = ComponentProps<"tr"> & {
  columns: Column<Row>[];
  row: Row;
};

export function DataTableRow<Row>({
  columns,
  row,
  ...rowProps
}: DataTableRowProps<Row>) {
  return (
    <tr className="border-t border-rule" {...rowProps}>
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
  );
}
