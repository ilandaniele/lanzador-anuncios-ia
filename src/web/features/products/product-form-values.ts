import { DEFAULT_CTA, type Cta } from "../../../shared/constants";
import type {
  CreateProductRequest,
  ProductDto,
} from "../../../shared/schemas/products";
import { DEFAULT_CURRENCY } from "./product-options";

export type ProductFormValues = {
  name: string;
  landingUrl: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: Cta;
  utm: string;
  priceMinor: number | null;
  costMinor: number | null;
  currency: string;
};

export type TextFieldKey =
  "name" | "landingUrl" | "primaryText" | "headline" | "description" | "utm";

export function toFormValues(product?: ProductDto): ProductFormValues {
  return {
    name: product?.name ?? "",
    landingUrl: product?.landingUrl ?? "",
    primaryText: product?.primaryText ?? "",
    headline: product?.headline ?? "",
    description: product?.description ?? "",
    cta: product?.cta ?? DEFAULT_CTA,
    utm: product?.utm ?? "",
    priceMinor: product?.priceMinor ?? null,
    costMinor: product?.costMinor ?? null,
    currency: product?.currency ?? DEFAULT_CURRENCY,
  };
}

export const toRequest = (values: ProductFormValues): CreateProductRequest => ({
  ...values,
  description: values.description.trim() || null,
  utm: values.utm.trim() || null,
});
