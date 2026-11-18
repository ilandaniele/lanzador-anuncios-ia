const DEFAULT_EXPONENT = 2;
const RATIO_DECIMALS = 2;
const PERCENT = 100;
const PER_MILLE = 1000;

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function currencyExponent(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? DEFAULT_EXPONENT
  );
}

export function toMinorUnits(amount: string, currency: string): number {
  return Math.round(Number(`${amount}e${currencyExponent(currency)}`));
}

export function roas(
  purchaseValueMinor: number,
  spendMinor: number,
): number | null {
  if (spendMinor <= 0) return null;
  return roundTo(purchaseValueMinor / spendMinor, RATIO_DECIMALS);
}

export function cpaMinor(spendMinor: number, purchases: number): number | null {
  if (purchases <= 0) return null;
  return Math.round(spendMinor / purchases);
}

export function ctr(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return roundTo((clicks / impressions) * PERCENT, RATIO_DECIMALS);
}

export function cpmMinor(
  spendMinor: number,
  impressions: number,
): number | null {
  if (impressions <= 0) return null;
  return Math.round((spendMinor / impressions) * PER_MILLE);
}
