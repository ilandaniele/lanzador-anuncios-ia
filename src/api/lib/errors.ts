import type { ErrorCode } from "../../shared/errors";

export interface AppErrorInit {
  message?: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
  retryAfterSec?: number;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSec?: number;

  constructor(status: number, code: ErrorCode, init: AppErrorInit = {}) {
    super(init.message ?? code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = init.fields;
    this.details = init.details;
    this.retryAfterSec = init.retryAfterSec;
  }
}

export const notFound = () => new AppError(404, "NOT_FOUND");

export const forbiddenRole = () => new AppError(403, "FORBIDDEN_ROLE");

export const conflict = (code: ErrorCode) => new AppError(409, code);

export const unprocessable = (
  code: ErrorCode,
  fields?: Record<string, string>,
) => new AppError(422, code, { fields });
