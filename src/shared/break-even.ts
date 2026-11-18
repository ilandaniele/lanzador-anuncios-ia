const ROAS_DECIMALS = 100;

export function profitPerSaleMinor(
  priceMinor: number | null,
  costMinor: number | null,
): number | null {
  if (priceMinor === null || costMinor === null) return null;
  const profit = priceMinor - costMinor;
  return profit > 0 ? profit : null;
}

export function breakEvenRoas(
  priceMinor: number | null,
  costMinor: number | null,
): number | null {
  const profit = profitPerSaleMinor(priceMinor, costMinor);
  if (profit === null || priceMinor === null) return null;
  return Math.round((priceMinor / profit) * ROAS_DECIMALS) / ROAS_DECIMALS;
}
