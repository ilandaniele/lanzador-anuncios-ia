import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RemovableChip,
  StatusChip,
  ToggleChip,
} from "../../../src/web/components/Chip";
import { EmptyState } from "../../../src/web/components/EmptyState";
import { Skeleton, SkeletonRegion } from "../../../src/web/components/Skeleton";

afterEach(cleanup);

describe("Chip", () => {
  it("ToggleChip reflects aria-pressed and toggles", () => {
    const onToggle = vi.fn();
    render(
      <ToggleChip pressed={false} onToggle={onToggle}>
        Dolor
      </ToggleChip>,
    );

    const chip = screen.getByRole("button", { name: "Dolor" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("RemovableChip names its remove button", () => {
    const onRemove = vi.fn();
    render(<RemovableChip label="Uruguay" onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("button", { name: "Quitar Uruguay" }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("StatusChip shows text, not only color", () => {
    render(<StatusChip tone="error">Con error</StatusChip>);

    expect(screen.getByText("Con error")).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("region is busy and announces its label", () => {
    render(
      <SkeletonRegion label="Cargando métricas">
        <Skeleton />
      </SkeletonRegion>,
    );

    const region = screen.getByText("Cargando métricas").parentElement;
    expect(region?.getAttribute("aria-busy")).toBe("true");
  });
});

describe("EmptyState", () => {
  it("renders the message and the action", () => {
    render(
      <EmptyState
        message="Todavía no lanzaste nada."
        action={<button type="button">Nuevo lanzamiento</button>}
      />,
    );

    expect(screen.getByText("Todavía no lanzaste nada.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Nuevo lanzamiento" }),
    ).toBeTruthy();
  });
});
