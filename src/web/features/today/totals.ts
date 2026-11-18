import type { TodayAccountDto } from "../../../shared/schemas/today";

export type CurrencyTotal = {
  currency: string;
  spendTodayMinor: number;
  spendYesterdayMinor: number;
};

export function totalsByCurrency(accounts: TodayAccountDto[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const account of accounts) {
    const total = totals.get(account.currency) ?? {
      currency: account.currency,
      spendTodayMinor: 0,
      spendYesterdayMinor: 0,
    };
    total.spendTodayMinor += account.spendTodayMinor;
    total.spendYesterdayMinor += account.spendYesterdayMinor;
    totals.set(account.currency, total);
  }
  return [...totals.values()];
}
