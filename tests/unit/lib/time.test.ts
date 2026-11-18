import { afterEach, describe, expect, it, vi } from "vitest";
import { now, utcPeriods } from "../../../src/api/lib/time";

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

describe("utcPeriods", () => {
  it("returns the UTC day, month and the next reset instants", () => {
    expect(utcPeriods(Date.UTC(2026, 10, 17, 21, 30))).toEqual({
      day: "2026-11-17",
      month: "2026-11",
      nextDayAt: Date.UTC(2026, 10, 18),
      nextMonthAt: Date.UTC(2026, 11, 1),
    });
  });

  it("rolls the month reset over the year boundary", () => {
    expect(utcPeriods(Date.UTC(2026, 11, 31, 23, 59)).nextMonthAt).toBe(
      Date.UTC(2027, 0, 1),
    );
  });
});
