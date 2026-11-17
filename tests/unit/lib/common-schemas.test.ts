import { describe, expect, it } from "vitest";
import { ROLE_RANK, ROLES } from "../../../src/shared/constants";
import {
  errorEnvelopeSchema,
  paginatedSchema,
  paginationQuerySchema,
} from "../../../src/shared/schemas/common";
import { z } from "zod";

describe("paginationQuerySchema", () => {
  it("defaults limit to 25", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 25 });
  });

  it("coerces limit from a query string and keeps cursor", () => {
    expect(
      paginationQuerySchema.parse({ limit: "100", cursor: "abc" }),
    ).toEqual({ limit: 100, cursor: "abc" });
  });

  it.each(["0", "101", "-1", "1.5", "abc"])("rejects limit %s", (limit) => {
    expect(paginationQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects an empty cursor", () => {
    expect(paginationQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("paginatedSchema", () => {
  const schema = paginatedSchema(z.object({ id: z.string() }));

  it("accepts data with a nullable nextCursor", () => {
    expect(
      schema.safeParse({ data: [{ id: "a" }], nextCursor: null }).success,
    ).toBe(true);
    expect(schema.safeParse({ data: [], nextCursor: "abc" }).success).toBe(
      true,
    );
  });

  it("requires nextCursor", () => {
    expect(schema.safeParse({ data: [] }).success).toBe(false);
  });
});

describe("errorEnvelopeSchema", () => {
  const base = { code: "NOT_FOUND", message: "No existe", requestId: "r1" };

  it("accepts the TRD envelope with and without optionals", () => {
    expect(errorEnvelopeSchema.safeParse({ error: base }).success).toBe(true);
    const full = {
      error: {
        ...base,
        code: "UPLOAD_OFFSET_MISMATCH",
        fields: { start: "bad" },
        details: { nextChunk: { start: 0, end: 10 } },
      },
    };
    expect(errorEnvelopeSchema.safeParse(full).success).toBe(true);
  });

  it("rejects unknown codes and missing requestId", () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { ...base, code: "NOPE" } })
        .success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: base.code, message: base.message },
      }).success,
    ).toBe(false);
  });
});

describe("ROLE_RANK", () => {
  it("orders viewer < editor < admin < owner", () => {
    expect(ROLES).toEqual(["viewer", "editor", "admin", "owner"]);
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.editor);
    expect(ROLE_RANK.editor).toBeLessThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeLessThan(ROLE_RANK.owner);
  });
});
