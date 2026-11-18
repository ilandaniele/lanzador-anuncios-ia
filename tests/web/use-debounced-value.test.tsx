import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "../../src/web/lib/use-debounced-value";

const DELAY_MS = 250;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", DELAY_MS));

    expect(result.current).toBe("a");
  });

  it("keeps the old value until the delay passes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, DELAY_MS),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(DELAY_MS - 1));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("restarts the delay on each change and emits only the last value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, DELAY_MS),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(DELAY_MS - 1));
    rerender({ value: "c" });
    act(() => vi.advanceTimersByTime(DELAY_MS - 1));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("c");
  });
});
