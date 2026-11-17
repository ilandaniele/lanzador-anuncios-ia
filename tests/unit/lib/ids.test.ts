import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "../../../src/api/lib/ids";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a UUIDv7", () => {
    expect(newId()).toMatch(UUID_V7);
  });

  it("is unique and strictly increasing across many calls", () => {
    const ids = Array.from({ length: 20_000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });

  it("stays ordered when the clock does not move or goes backwards", () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000_000_000_000);
    const first = newId();
    const sameInstant = newId();
    vi.setSystemTime(3_999_999_999_000);
    const afterRewind = newId();
    expect(sameInstant > first).toBe(true);
    expect(afterRewind > sameInstant).toBe(true);
  });

  it("encodes the timestamp in the first 48 bits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000_000_000_000);
    const timestamp = parseInt(newId().replace("-", "").slice(0, 12), 16);
    expect(timestamp).toBe(5_000_000_000_000);
  });
});
