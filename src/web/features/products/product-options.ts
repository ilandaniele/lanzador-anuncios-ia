import { CTAS } from "../../../shared/constants";
import type { SelectOption } from "../../components/Select";
import { t } from "../../i18n/es-AR";

const CURRENCIES = ["USD", "ARS", "EUR", "BRL", "MXN", "CLP", "COP", "UYU"];

export const DEFAULT_CURRENCY = "USD";

export const ctaOptions: SelectOption[] = CTAS.map((cta) => ({
  value: cta,
  label: t(`products.cta.${cta}`),
}));

export function currencyOptions(current: string): SelectOption[] {
  const codes = CURRENCIES.includes(current)
    ? CURRENCIES
    : [current, ...CURRENCIES];
  return codes.map((code) => ({ value: code, label: code }));
}
