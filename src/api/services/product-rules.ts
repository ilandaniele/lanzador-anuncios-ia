import { conflict, unprocessable } from "../lib/errors";
import { isCheckViolation, isUniqueViolation } from "../repositories/db-errors";

const HTTPS_PREFIX = /^https:\/\//i;

export const normalizeProductName = (name: string) => name.trim().toLowerCase();

export function assertHttpsLanding(url: string) {
  if (!HTTPS_PREFIX.test(url) || !URL.canParse(url)) {
    throw unprocessable("LANDING_NOT_HTTPS", { landingUrl: "not_https" });
  }
}

export function rethrowProductWriteError(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict("NAME_TAKEN");
  if (isCheckViolation(error, "products_cost_minor_check")) {
    throw unprocessable("COST_NOT_BELOW_PRICE");
  }
  throw error;
}
