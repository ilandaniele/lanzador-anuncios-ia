import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../../src/web/components/ConfirmDialog";

afterEach(cleanup);

type DialogProps = Partial<Parameters<typeof ConfirmDialog>[0]>;

function Harness(props: DialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Escalar
      </button>
      {open && (
        <ConfirmDialog
          title="Escalar presupuesto de campaña"
          confirmLabel="Escalar a US$ 156,00"
          onConfirm={vi.fn()}
          onCancel={() => setOpen(false)}
          {...props}
        />
      )}
    </>
  );
}

function scrimOf(dialog: HTMLElement) {
  return dialog.previousElementSibling as HTMLElement;
}

function openDialog() {
  const trigger = screen.getByRole("button", { name: "Escalar" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("ConfirmDialog", () => {
  it("is a labelled modal dialog with Cancelar focused first", () => {
    render(<Harness />);
    openDialog();

    const dialog = screen.getByRole("dialog", {
      name: "Escalar presupuesto de campaña",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancelar" }),
    );
  });

  it("renders the comprobante rows, amount and consequence", () => {
    render(
      <Harness
        amount="US$ 156,00 por día"
        rows={[{ label: "Cuenta", value: "Cuenta A (act_1)" }]}
        consequence="Meta empieza a gastar en minutos."
      />,
    );
    openDialog();

    expect(screen.getByText("US$ 156,00 por día")).toBeTruthy();
    expect(screen.getByText("Cuenta")).toBeTruthy();
    expect(screen.getByText("Cuenta A (act_1)")).toBeTruthy();
    expect(screen.getByText("Meta empieza a gastar en minutos.")).toBeTruthy();
  });

  it("traps focus: Tab and Shift+Tab wrap inside the dialog", () => {
    render(<Harness />);
    openDialog();

    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", {
      name: "Escalar a US$ 156,00",
    });

    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("returns focus to the trigger on Escape", () => {
    render(<Harness />);
    const trigger = openDialog();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the trigger on Cancelar", () => {
    render(<Harness />);
    const trigger = openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(document.activeElement).toBe(trigger);
  });

  it("closes on scrim click but not on panel click", () => {
    render(<Harness />);
    openDialog();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeTruthy();

    fireEvent.click(scrimOf(dialog));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not close on Escape or scrim while submitting", () => {
    const onConfirm = vi.fn();
    render(
      <Harness submitting submittingLabel="Escalando…" onConfirm={onConfirm} />,
    );
    openDialog();
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(scrimOf(dialog));
    fireEvent.click(screen.getByRole("button", { name: "Escalando…" }));

    expect(screen.queryByRole("dialog")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows the error strip and stays open", () => {
    render(<Harness errorMessage="Meta rechazó el cambio (código 100)" />);
    openDialog();

    expect(screen.getByRole("alert").textContent).toContain("código 100");
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("confirms with the action button", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    openDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Escalar a US$ 156,00" }),
    );

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("requires typing the exact name before confirming", () => {
    const onConfirm = vi.fn();
    render(
      <Harness
        title="Borrar workspace"
        confirmLabel="Borrar Mi negocio"
        requireText="Mi negocio"
        onConfirm={onConfirm}
      />,
    );
    openDialog();

    const confirm = screen.getByRole("button", { name: "Borrar Mi negocio" });
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm.getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Mi negocio" },
    });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
