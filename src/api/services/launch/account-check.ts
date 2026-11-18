import type { AccountHealth } from "../../integrations/meta/read";
import { line } from "./plan-lines";

const LAUNCH_CURRENCY = "USD";
const ELIGIBLE_ACCOUNT_STATUSES = [1, 201];

export const isEligibleAccountStatus = (accountStatus: number) =>
  ELIGIBLE_ACCOUNT_STATUSES.includes(accountStatus);

export function accountBlockers({ accountStatus, currency }: AccountHealth) {
  return [
    ...(isEligibleAccountStatus(accountStatus)
      ? []
      : [
          line("ACCOUNT_NOT_ELIGIBLE", "La cuenta publicitaria no está activa"),
        ]),
    ...(currency === LAUNCH_CURRENCY
      ? []
      : [line("ACCOUNT_NOT_USD", "La cuenta publicitaria no opera en USD")]),
  ];
}
