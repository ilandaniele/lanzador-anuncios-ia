import { describe, expect, it } from "vitest";
import {
  nameValuesAt,
  renderNameTemplate,
} from "../../src/shared/name-templates";

const values = { producto: "Zapatillas", fecha: "05-03", hora: "09:07", n: 2 };

describe("renderNameTemplate", () => {
  it("replaces every placeholder", () => {
    expect(
      renderNameTemplate("{producto} {fecha} {hora} CONJ {n}", values),
    ).toBe("Zapatillas 05-03 09:07 CONJ 2");
  });

  it("replaces repeated placeholders", () => {
    expect(renderNameTemplate("{n}-{n}", values)).toBe("2-2");
  });

  it("keeps unknown placeholders and inherited property names", () => {
    expect(renderNameTemplate("{hook} {constructor}", values)).toBe(
      "{hook} {constructor}",
    );
  });

  it("returns a template without placeholders unchanged", () => {
    expect(renderNameTemplate("Campana fija", values)).toBe("Campana fija");
  });
});

describe("nameValuesAt", () => {
  const at = Date.UTC(2026, 2, 5, 12, 7);

  it("formats date and time in the given time zone", () => {
    expect(
      nameValuesAt(at, "America/Argentina/Buenos_Aires", "Zapatillas", 1),
    ).toEqual({ producto: "Zapatillas", fecha: "05-03", hora: "09:07", n: 1 });
  });

  it("rolls the date over when the zone is ahead of UTC", () => {
    const lateUtc = Date.UTC(2026, 2, 5, 23, 30);

    expect(nameValuesAt(lateUtc, "Asia/Tokyo", "P", 1)).toMatchObject({
      fecha: "06-03",
      hora: "08:30",
    });
  });
});
