import { breakEvenRoas, profitPerSaleMinor } from "../break-even";
import type { MetricsRow } from "../metrics/aggregate";
import type { PilotRuleOf, ProductEconomics } from "./types";

const ROAS_DECIMALS = 100;

const economicsOf = (
  row: MetricsRow,
  products: ReadonlyMap<string, ProductEconomics>,
) => (row.productId ? products.get(row.productId) : undefined);

export function targetCpaMinor(
  params: PilotRuleOf<"pause_no_sales">["params"],
  row: MetricsRow,
  products: ReadonlyMap<string, ProductEconomics>,
): number {
  if (params.targetCpaSource === "fixed") return params.fallbackTargetCpaMinor;
  const economics = economicsOf(row, products);
  const margin = economics
    ? profitPerSaleMinor(economics.priceMinor, economics.costMinor)
    : null;
  return margin ?? params.fallbackTargetCpaMinor;
}

export function winnerMinRoas(
  params: PilotRuleOf<"scale_winner">["params"],
  row: MetricsRow,
  products: ReadonlyMap<string, ProductEconomics>,
): number {
  const economics = economicsOf(row, products);
  const breakEven = economics
    ? breakEvenRoas(economics.priceMinor, economics.costMinor)
    : null;
  if (breakEven === null) return params.fallbackMinRoas;
  return (
    Math.round(breakEven * params.breakEvenMultiplier * ROAS_DECIMALS) /
    ROAS_DECIMALS
  );
}
