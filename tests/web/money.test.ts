import { describe, expect, it } from "vitest";
import {
  formatMinorForInput,
  formatMoney,
  parseMoneyToMinor,
} from "../../src/web/lib/money";

describe("money helpers", () => {
  it("formats minor units in es-AR", () => {
    expect(formatMoney(15600).replace(/\s/g, " ")).toBe("US$ 156,00");
    expect(formatMoney(123450, "ARS").replace(/\s/g, " ")).toBe("$ 1.234,50");
  });

  it.each([
    ["156", 15600],
    ["156,5", 15650],
    ["156,50", 15650],
    ["156.5", 15650],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["US$ 12,05", 1205],
    [",99", 99],
  ])("parses %s to %i minor units", (text, minor) => {
    expect(parseMoneyToMinor(text)).toBe(minor);
  });

  it("returns null without digits", () => {
    expect(parseMoneyToMinor("")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
  });

  it("formats minor units for the input with comma decimal", () => {
    expect(formatMinorForInput(15650)).toBe("156,50");
    expect(formatMinorForInput(null)).toBe("");
  });
});
