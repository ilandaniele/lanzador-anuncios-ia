import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Combobox,
  type ComboboxOption,
} from "../../../src/web/components/Combobox";

afterEach(cleanup);

const options: ComboboxOption[] = [
  { value: "1", label: "Cuenta Argentina" },
  { value: "2", label: "Cuenta Uruguay" },
  { value: "3", label: "Campaña Única" },
];

function Harness(props: Partial<Parameters<typeof Combobox>[0]>) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <Combobox
        label="Cuenta"
        options={options}
        value={value}
        onChange={setValue}
        {...props}
      />
      <output data-testid="value">{String(value)}</output>
    </>
  );
}

describe("Combobox", () => {
  it("exposes the ARIA combobox and listbox pattern", () => {
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Cuenta" });
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option").length).toBe(3);
    const activeId = input.getAttribute("aria-activedescendant");
    expect(document.getElementById(activeId ?? "")?.textContent).toBe(
      "Cuenta Argentina",
    );
  });

  it("filters while typing, ignoring accents, and Enter picks", () => {
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Cuenta" });
    fireEvent.change(input, { target: { value: "campana" } });
    expect(screen.getAllByRole("option").length).toBe(1);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("value").textContent).toBe("3");
    expect((input as HTMLInputElement).value).toBe("Campaña Única");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("moves with arrows and closes on Escape", () => {
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Cuenta" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("value").textContent).toBe("2");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("value").textContent).toBe("2");
  });

  it("selects on click", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("combobox", { name: "Cuenta" }));
    fireEvent.click(screen.getByRole("option", { name: "Cuenta Uruguay" }));

    expect(screen.getByTestId("value").textContent).toBe("2");
  });

  it("shows the empty text when nothing matches", () => {
    render(<Harness emptyText="No hay campañas activas en esta cuenta" />);

    fireEvent.change(screen.getByRole("combobox", { name: "Cuenta" }), {
      target: { value: "zzz" },
    });

    expect(
      screen.getByText("No hay campañas activas en esta cuenta"),
    ).toBeTruthy();
    expect(screen.queryAllByRole("option").length).toBe(0);
  });

  it("shows a busy skeleton region while loading", () => {
    render(<Harness loading />);

    fireEvent.click(screen.getByRole("combobox", { name: "Cuenta" }));

    expect(screen.getByText("Cargando opciones")).toBeTruthy();
    expect(screen.queryAllByRole("option").length).toBe(0);
  });

  it("shows the load error with Reintentar", () => {
    const onRetry = vi.fn();
    render(
      <Harness loadError="No pudimos cargar las cuentas" onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "No pudimos cargar las cuentas",
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
