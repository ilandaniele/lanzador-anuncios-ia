import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  decodeNumericCursor,
  encodeCursor,
  paginate,
} from "../../../src/api/lib/cursor";
import { AppError } from "../../../src/api/lib/errors";
import { newId } from "../../../src/api/lib/ids";

describe("cursor", () => {
  it("round-trips an id", () => {
    const position = { id: newId() };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it("round-trips a sort value", () => {
    const numeric = { id: newId(), sortValue: 1234.5 };
    expect(decodeCursor(encodeCursor(numeric))).toEqual(numeric);
    const textual = { id: newId(), sortValue: "ñandú" };
    expect(decodeCursor(encodeCursor(textual))).toEqual(textual);
  });

  it("is opaque and url-safe", () => {
    const id = newId();
    const cursor = encodeCursor({ id });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain(id);
  });

  it.each([
    ["not base64", "***"],
    ["empty", ""],
    ["not json", "aGVsbG8"],
    ["wrong shape", "eyJmb28iOjF9"],
    ["id of wrong type", "eyJpZCI6MX0"],
  ])("rejects a tampered cursor: %s", (_label, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(AppError);
    expect(() => decodeCursor(cursor)).toThrow(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION",
        fields: { cursor: expect.any(String) },
      }),
    );
  });

  it("rejects a truncated cursor", () => {
    const cursor = encodeCursor({ id: newId() });
    expect(() => decodeCursor(cursor.slice(0, -6))).toThrow(AppError);
  });
});

describe("paginate", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("drops the lookahead row and points the cursor at the last kept row", () => {
    const page = paginate(rows, 2);
    expect(page.rows).toEqual([{ id: "a" }, { id: "b" }]);
    expect(decodeCursor(page.nextCursor!)).toEqual({ id: "b" });
  });

  it.each([[3], [4]])("returns no cursor when limit is %i", (limit) => {
    expect(paginate(rows, limit)).toEqual({ rows, nextCursor: null });
  });

  it("handles an empty page", () => {
    expect(paginate([], 5)).toEqual({ rows: [], nextCursor: null });
  });

  it("puts the sort value of the last kept row in the cursor", () => {
    const sorted = [
      { id: "a", at: 30 },
      { id: "b", at: 20 },
      { id: "c", at: 10 },
    ];
    const page = paginate(sorted, 2, (row) => row.at);
    expect(decodeCursor(page.nextCursor!)).toEqual({ id: "b", sortValue: 20 });
  });
});

describe("decodeNumericCursor", () => {
  it("returns id and numeric sort value", () => {
    const position = { id: newId(), sortValue: 42 };
    expect(decodeNumericCursor(encodeCursor(position))).toEqual(position);
  });

  it.each([[{ id: "a" }], [{ id: "a", sortValue: "text" }]])(
    "rejects a cursor without a numeric sort value: %j",
    (position) => {
      expect(() => decodeNumericCursor(encodeCursor(position))).toThrow(
        expect.objectContaining({
          status: 400,
          code: "VALIDATION",
          fields: { cursor: "invalid" },
        }),
      );
    },
  );
});
