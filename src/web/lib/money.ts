const MINOR_PER_MAJOR = 100;

export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(
    minor / MINOR_PER_MAJOR,
  );
}

export function currencySymbol(currency = "USD"): string {
  const parts = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}

export function formatMinorForInput(minor: number | null): string {
  if (minor === null) return "";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(minor / MINOR_PER_MAJOR);
}

export function parseMoneyToMinor(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const decimalSeparator = cleaned.includes(",")
    ? ","
    : /\.\d{1,2}$/.test(cleaned)
      ? "."
      : null;
  const separatorIndex = decimalSeparator
    ? cleaned.lastIndexOf(decimalSeparator)
    : -1;
  const integerPart = (
    separatorIndex >= 0 ? cleaned.slice(0, separatorIndex) : cleaned
  ).replace(/\D/g, "");
  const decimalPart =
    separatorIndex >= 0
      ? cleaned.slice(separatorIndex + 1).replace(/\D/g, "")
      : "";
  return (
    Number(integerPart || "0") * MINOR_PER_MAJOR +
    Number(decimalPart.padEnd(2, "0").slice(0, 2))
  );
}
