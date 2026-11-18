import type { SelectOption } from "../../components/Select";

const CURRENCIES = [
  "ARS",
  "USD",
  "BRL",
  "CLP",
  "COP",
  "MXN",
  "PEN",
  "UYU",
  "EUR",
];

const toOptions = (values: string[], current: string): SelectOption[] =>
  (values.includes(current) ? values : [current, ...values]).map((value) => ({
    value,
    label: value,
  }));

export const currencyOptions = (current: string) =>
  toOptions(CURRENCIES, current);

export const timezoneOptions = (current: string) =>
  toOptions(Intl.supportedValuesOf("timeZone"), current);
