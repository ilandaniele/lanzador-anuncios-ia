import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "../../../src/web/components/Button";

afterEach(cleanup);

describe("Button", () => {
  it("calls onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lanzar en pausa</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Lanzar en pausa" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("blocks double click while loading and swaps the label", () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Lanzando…" onClick={onClick}>
        Lanzar en pausa
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Lanzando…" });
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("uses aria-disabled with the reason as description", () => {
    const onClick = vi.fn();
    render(
      <Button disabledReason="Falta elegir la cuenta" onClick={onClick}>
        Siguiente
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Siguiente" });
    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("title")).toBe("Falta elegir la cuenta");
    expect(
      screen.getByRole("button", {
        name: "Siguiente",
        description: "Falta elegir la cuenta",
      }),
    ).toBeTruthy();
  });

  it("IconButton exposes its aria-label", () => {
    render(<IconButton aria-label="Cerrar panel">x</IconButton>);

    expect(screen.getByRole("button", { name: "Cerrar panel" })).toBeTruthy();
  });
});
