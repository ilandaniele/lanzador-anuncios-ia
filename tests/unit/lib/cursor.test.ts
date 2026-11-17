import { describe, expect, it } from "vitest";
import {
  decodeCursor,
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
});
