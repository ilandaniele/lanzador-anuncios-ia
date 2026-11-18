import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useState, type RefObject } from "react";
import type { Column } from "./DataTable";
import { DataTableRow } from "./DataTableRow";

const ESTIMATED_ROW_HEIGHT_PX = 64;
const OVERSCAN_ROWS = 10;
const HEADER_ROW_COUNT = 1;

type VirtualRowsProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  bodyRef: RefObject<HTMLTableSectionElement | null>;
};

function Spacer({ height, span }: { height: number; span: number }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden="true" style={{ height }}>
      <td colSpan={span} className="p-0" />
    </tr>
  );
}

export function VirtualRows<Row>({
  columns,
  rows,
  getRowKey,
  bodyRef,
}: VirtualRowsProps<Row>) {
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
    setScrollMargin(Math.round(top + window.scrollY));
  }, [bodyRef]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items[items.length - 1];
  const spaceBefore = first ? first.start - scrollMargin : 0;
  const spaceAfter = last
    ? virtualizer.getTotalSize() - (last.end - scrollMargin)
    : 0;

  return (
    <>
      <Spacer height={spaceBefore} span={columns.length} />
      {items.map((item) => {
        const row = rows[item.index] as Row;
        return (
          <DataTableRow
            key={getRowKey(row)}
            ref={virtualizer.measureElement}
            data-index={item.index}
            aria-rowindex={item.index + 1 + HEADER_ROW_COUNT}
            columns={columns}
            row={row}
          />
        );
      })}
      <Spacer height={spaceAfter} span={columns.length} />
    </>
  );
}
