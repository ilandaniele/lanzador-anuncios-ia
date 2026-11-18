import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../../../src/web/components/Toast";

type NotifyInput = Parameters<ReturnType<typeof useToast>["notify"]>[0];

function Trigger({ input }: { input: NotifyInput }) {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => notify(input)}>
      go
    </button>
  );
}

function setup(input: NotifyInput) {
  render(
    <ToastProvider>
      <Trigger input={input} />
    </ToastProvider>,
  );
  const go = screen.getByRole("button", { name: "go" });
  return () => fireEvent.click(go);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("success uses role=status and closes after 4s", () => {
    setup({ tone: "success", message: "Campaña pausada" })();

    expect(screen.getByRole("status").textContent).toContain("Campaña pausada");
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.queryByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("error uses role=alert and stays until closed", () => {
    setup({ tone: "error", message: "No se pudo pausar" })();

    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo pausar",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("action runs, dismisses, and lasts 6s", () => {
    const onUndo = vi.fn();
    const click = setup({
      tone: "success",
      message: "Campaña pausada",
      action: { label: "Deshacer", onClick: onUndo },
    });
    click();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("status")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses while hovered", () => {
    setup({ tone: "info", message: "Guardado" })();

    const toast = screen.getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.queryByRole("status")).toBeTruthy();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(4001));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stacks at most 3", () => {
    const click = setup({ tone: "info", message: "Hola" });
    click();
    click();
    click();
    click();

    expect(screen.getAllByRole("status").length).toBe(3);
  });
});
