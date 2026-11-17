import { describe, expect, it } from "vitest";
import {
  AppError,
  conflict,
  forbiddenRole,
  notFound,
  unprocessable,
} from "../../../src/api/lib/errors";
import { ERROR_STATUS } from "../../../src/shared/errors";

describe("AppError", () => {
  it("carries status, code and optional extras", () => {
    const error = new AppError(503, "EMAIL_SEND_FAILED", {
      fields: { email: "bad" },
      details: { attempt: 2 },
      retryAfterSec: 60,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(503);
    expect(error.code).toBe("EMAIL_SEND_FAILED");
    expect(error.fields).toEqual({ email: "bad" });
    expect(error.details).toEqual({ attempt: 2 });
    expect(error.retryAfterSec).toBe(60);
  });

  it("uses the code as default message", () => {
    expect(new AppError(500, "INTERNAL").message).toBe("INTERNAL");
  });
});

describe("helpers", () => {
  it("notFound is 404 NOT_FOUND", () => {
    expect(notFound()).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("forbiddenRole is 403 FORBIDDEN_ROLE", () => {
    expect(forbiddenRole()).toMatchObject({
      status: 403,
      code: "FORBIDDEN_ROLE",
    });
  });

  it("conflict is 409 with the given code", () => {
    expect(conflict("NOT_PAUSED")).toMatchObject({
      status: 409,
      code: "NOT_PAUSED",
    });
  });

  it("unprocessable is 422 with code and fields", () => {
    const error = unprocessable("BUDGET_CAP", { dailyBudgetMinor: "too high" });
    expect(error).toMatchObject({
      status: 422,
      code: "BUDGET_CAP",
      fields: { dailyBudgetMinor: "too high" },
    });
  });
});

describe("ERROR_STATUS", () => {
  it("matches the TRD for representative codes", () => {
    expect(ERROR_STATUS).toMatchObject({
      VALIDATION: 400,
      UNAUTHENTICATED: 401,
      CSRF_FAILED: 403,
      FORBIDDEN_ROLE: 403,
      NOT_FOUND: 404,
      LINK_EXPIRED: 410,
      UPLOAD_OFFSET_MISMATCH: 409,
      AI_BUDGET_EXHAUSTED: 422,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    });
  });
});
