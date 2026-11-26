import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaidPlanId } from "../../../shared/billing";
import type { BillingOverview } from "../../../shared/schemas/billing";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { redirectToExternal } from "../meta/external-redirect";

const billingApi = (workspaceId: string) => `/api/w/${workspaceId}/billing`;

export const useBilling = (workspaceId: string) =>
  useQuery({
    queryKey: qk.billing(workspaceId),
    queryFn: () => apiFetch<BillingOverview>(billingApi(workspaceId)),
    refetchOnMount: "always",
  });

export const useSubscribe = (workspaceId: string) =>
  useMutation({
    mutationFn: (planId: PaidPlanId) =>
      apiFetch<{ initPoint: string }>(`${billingApi(workspaceId)}/subscribe`, {
        method: "POST",
        body: { planId },
      }),
    onSuccess: ({ initPoint }) => redirectToExternal(initPoint),
  });

export function useCancelSubscription(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`${billingApi(workspaceId)}/cancel`, { method: "POST" }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.billing(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.me() }),
      ]),
  });
}
