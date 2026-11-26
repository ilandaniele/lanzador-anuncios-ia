import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BillingOverview } from "../../../shared/schemas/billing";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { t } from "../../i18n/es-AR";
import { qk } from "../../lib/query-keys";
import {
  billingErrorMessage,
  fillText,
  formatBillingDate,
  trialMessage,
} from "./billing-text";
import { PlanCards } from "./PlanCards";
import { useBilling, useCancelSubscription, useSubscribe } from "./use-billing";

const OPEN_STATUSES = ["pending", "authorized", "paused"];

function TrialLine({ overview }: { overview: BillingOverview }) {
  const { trialEndsAt, subscription } = overview;
  if (trialEndsAt === null || subscription?.status === "authorized")
    return null;
  return <p>{trialMessage(trialEndsAt)}</p>;
}

function SubscriptionLines({ overview }: { overview: BillingOverview }) {
  const { subscription } = overview;
  if (!subscription) return null;
  return (
    <>
      <p>{t(`billing.status.${subscription.status}`)}</p>
      {subscription.paidUntil && (
        <p>
          {fillText(t("billing.paidUntil"), {
            date: formatBillingDate(subscription.paidUntil),
          })}
        </p>
      )}
    </>
  );
}

function BillingContent({
  workspaceId,
  overview,
}: {
  workspaceId: string;
  overview: BillingOverview;
}) {
  const subscribe = useSubscribe(workspaceId);
  const cancel = useCancelSubscription(workspaceId);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const { subscription } = overview;
  const showPlans = !overview.isFree && subscription?.status !== "authorized";
  const canCancel = subscription && OPEN_STATUSES.includes(subscription.status);
  const subscribingPlanId =
    subscribe.isPending || subscribe.isSuccess
      ? subscribe.variables
      : undefined;

  if (overview.isFree) return <p>{t("billing.freePlan")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">
          {fillText(t("billing.currentPlan"), { plan: overview.planName })}
        </p>
        <TrialLine overview={overview} />
        <SubscriptionLines overview={overview} />
      </div>
      {subscribe.error && (
        <p role="alert" className="rounded-sm bg-loss-soft p-3 text-ink">
          {billingErrorMessage(subscribe.error)}
        </p>
      )}
      {cancel.isSuccess && <p role="status">{t("billing.cancelled")}</p>}
      {showPlans && (
        <PlanCards
          plans={overview.plans}
          subscribingPlanId={subscribingPlanId}
          onSubscribe={(planId) => subscribe.mutate(planId)}
        />
      )}
      {canCancel && (
        <div>
          <Button variant="secondary" onClick={() => setConfirmingCancel(true)}>
            {t("billing.cancel")}
          </Button>
        </div>
      )}
      {confirmingCancel && (
        <ConfirmDialog
          title={t("billing.cancel")}
          confirmLabel={t("billing.cancel")}
          consequence={t("billing.cancelConfirm")}
          submitting={cancel.isPending}
          errorMessage={
            cancel.error ? billingErrorMessage(cancel.error) : undefined
          }
          onConfirm={() =>
            cancel.mutate(undefined, {
              onSuccess: () => setConfirmingCancel(false),
            })
          }
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </div>
  );
}

export function BillingPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const billing = useBilling(workspaceId);

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: qk.me() });
  }, [queryClient]);

  if (billing.isPending)
    return (
      <SkeletonRegion
        label={t("common.loading")}
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24" />
      </SkeletonRegion>
    );
  if (billing.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>{t("billing.error")}</p>
        <Button variant="secondary" onClick={() => void billing.refetch()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  return <BillingContent workspaceId={workspaceId} overview={billing.data} />;
}
