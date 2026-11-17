import { describe, expect, it } from "vitest";
import {
  breakEvenRoas,
  profitPerSaleMinor,
} from "../../../src/api/services/break-even";

describe("profitPerSaleMinor", () => {
  it("is price minus cost", () => {
    expect(profitPerSaleMinor(10000, 4000)).toBe(6000);
  });

  it("keeps the full price when cost is 0", () => {
    expect(profitPerSaleMinor(10000, 0)).toBe(10000);
  });

  it.each([
    [null, 4000],
    [10000, null],
    [null, null],
  ])("is null when price or cost is missing: %s, %s", (price, cost) => {
    expect(profitPerSaleMinor(price, cost)).toBeNull();
  });

  it.each([
    [4000, 4000],
    [4000, 5000],
  ])("is null when cost reaches price: %i, %i", (price, cost) => {
    expect(profitPerSaleMinor(price, cost)).toBeNull();
  });
});

describe("breakEvenRoas", () => {
  it("is price over profit", () => {
    expect(breakEvenRoas(10000, 5000)).toBe(2);
  });

  it("is 1 when cost is 0", () => {
    expect(breakEvenRoas(10000, 0)).toBe(1);
  });

  it("rounds to 2 decimals", () => {
    expect(breakEvenRoas(10000, 6667)).toBe(3);
    expect(breakEvenRoas(10000, 3000)).toBe(1.43);
    expect(breakEvenRoas(30000, 10000)).toBe(1.5);
  });

  it.each([
    [null, 4000],
    [10000, null],
    [null, null],
  ])("is null when price or cost is missing: %s, %s", (price, cost) => {
    expect(breakEvenRoas(price, cost)).toBeNull();
  });

  it("is null when cost reaches price", () => {
    expect(breakEvenRoas(4000, 4000)).toBeNull();
  });
});
