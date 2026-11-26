import type { PaidPlanId } from "../../../shared/billing";
import type { BillingPlan } from "../../../shared/schemas/billing";
import { Button } from "../../components/Button";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import { fillText } from "./billing-text";

type PlanCardsProps = {
  plans: BillingPlan[];
  subscribingPlanId: PaidPlanId | undefined;
  onSubscribe: (planId: PaidPlanId) => void;
};

export function PlanCards({
  plans,
  subscribingPlanId,
  onSubscribe,
}: PlanCardsProps) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {plans.map((plan) => (
        <li
          key={plan.id}
          className="flex flex-col gap-3 rounded-lg border border-rule p-4"
        >
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <p className="text-2xl font-semibold tabular-nums">
            {fillText(t("billing.perMonth"), {
              price: formatMoney(plan.priceMonthlyMinor, plan.currency),
            })}
          </p>
          <p className="text-ink-muted">
            {fillText(t("billing.limits"), {
              members: plan.maxMembers,
              adAccounts: plan.maxAdAccounts,
            })}
          </p>
          <div className="mt-auto">
            <Button
              loading={subscribingPlanId === plan.id}
              loadingLabel={t("billing.redirecting")}
              onClick={() => onSubscribe(plan.id)}
            >
              {fillText(t("billing.subscribe"), { plan: plan.name })}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
