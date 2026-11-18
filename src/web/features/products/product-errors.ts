import type { ErrorCode } from "../../../shared/errors";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";
import type { ProductFormValues } from "./product-form-values";

export const FIELD_LABELS: Record<keyof ProductFormValues, TextKey> = {
  name: "products.form.name",
  landingUrl: "products.form.landingUrl",
  primaryText: "products.form.primaryText",
  headline: "products.form.headline",
  description: "products.form.description",
  cta: "products.form.cta",
  utm: "products.form.utm",
  priceMinor: "products.form.priceMinor",
  costMinor: "products.form.costMinor",
  currency: "products.form.currency",
};

const CODE_ERRORS: Partial<
  Record<ErrorCode, { field: keyof ProductFormValues; message: TextKey }>
> = {
  NAME_TAKEN: { field: "name", message: "products.errors.nameTaken" },
  COST_NOT_BELOW_PRICE: {
    field: "costMinor",
    message: "products.errors.costNotBelowPrice",
  },
};

const FIELD_ERROR_KEYS: Record<string, TextKey> = {
  too_small: "products.fieldError.too_small",
  too_big: "products.fieldError.too_big",
  invalid_format: "products.fieldError.invalid_format",
  not_https: "products.fieldError.not_https",
};

export function productFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const byCode = CODE_ERRORS[error.code];
  const byField = Object.entries(error.fields ?? {}).map(([field, code]) => [
    field,
    t(FIELD_ERROR_KEYS[code] ?? "products.fieldError.invalid"),
  ]);
  return {
    ...(byCode && { [byCode.field]: t(byCode.message) }),
    ...Object.fromEntries(byField),
  };
}

export function duplicateErrorMessage(error: unknown): string {
  const isNameTaken = error instanceof ApiError && error.code === "NAME_TAKEN";
  return t(
    isNameTaken ? "products.errors.duplicateNameTaken" : "errors.generic",
  );
}
