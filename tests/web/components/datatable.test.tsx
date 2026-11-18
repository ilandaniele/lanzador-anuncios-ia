import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DataTable,
  type Column,
  type Sort,
} from "../../../src/web/components/DataTable";

afterEach(cleanup);

type Row = { id: string; name: string; spend: number };

const rows: Row[] = [
  { id: "a", name: "Campaña A", spend: 100 },
  { id: "b", name: "Campaña B", spend: 50 },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Nombre", render: (r) => r.name, rowHeader: true },
  {
    key: "spend",
    header: "Gasto",
    render: (r) => r.spend,
    numeric: true,
    sortable: true,
  },
];

const base = {
  caption: "Campañas de Cuenta A",
  columns,
  getRowKey: (r: Row) => r.id,
};

describe("DataTable", () => {
  it("is a semantic table with caption, th scope and row headers", () => {
    render(<DataTable {...base} rows={rows} />);

    expect(
      screen.getByRole("table", { name: "Campañas de Cuenta A" }),
    ).toBeTruthy();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.getAttribute("scope"))).toEqual(["col", "col"]);
    expect(screen.getByRole("rowheader", { name: "Campaña A" })).toBeTruthy();
  });

  it("sets aria-sort only on sortable columns and cycles asc, desc, none", () => {
    function Harness() {
      const [sort, setSort] = useState<Sort | null>(null);
      return (
        <DataTable {...base} rows={rows} sort={sort} onSortChange={setSort} />
      );
    }
    render(<Harness />);

    const nameHeader = screen.getByRole("columnheader", { name: "Nombre" });
    const spendHeader = screen.getByRole("columnheader", { name: /Gasto/ });
    expect(nameHeader.getAttribute("aria-sort")).toBeNull();
    expect(spendHeader.getAttribute("aria-sort")).toBe("none");

    const button = within(spendHeader).getByRole("button");
    fireEvent.click(button);
    expect(spendHeader.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(button);
    expect(spendHeader.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(button);
    expect(spendHeader.getAttribute("aria-sort")).toBe("none");
  });

  it("shows 8 skeleton rows while loading", () => {
    render(<DataTable {...base} rows={[]} loading />);

    expect(screen.getAllByRole("row").length).toBe(1 + 8);
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
  });

  it("shows the empty message", () => {
    render(<DataTable {...base} rows={[]} empty="No hay campañas" />);

    expect(screen.getByText("No hay campañas")).toBeTruthy();
  });

  it("shows a single error row with Reintentar", () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        {...base}
        rows={rows}
        error="No pudimos cargar"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("No pudimos cargar");
    expect(screen.queryByText("Campaña A")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps old rows visible while updating", () => {
    render(<DataTable {...base} rows={rows} updating />);

    expect(screen.getByText("Campaña A")).toBeTruthy();
  });
});
