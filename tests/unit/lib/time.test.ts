import { afterEach, describe, expect, it, vi } from "vitest";
import { now } from "../../../src/api/lib/time";

describe("now", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns epoch milliseconds as an integer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_123);
    expect(now()).toBe(1_700_000_000_123);
    expect(Number.isInteger(now())).toBe(true);
  });
});
