import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ObjectStatusRequest,
  ObjectStatusResponse,
  ProtectCampaignRequest,
  ScaleCampaignRequest,
  ScaleCampaignResponse,
} from "../../../shared/schemas/meta-actions";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { formatMoney } from "../../lib/money";
import { patchRowOptimistically } from "./optimistic-rows";
import {
  isWritableStatus,
  oppositeStatus,
  type ActionableRow,
  type ScalableRow,
} from "./row-actions-model";

type WritableStatus = ObjectStatusResponse["status"];

type StatusChange = {
  status: WritableStatus;
  previous: WritableStatus | null;
  undoable: boolean;
};

const workspaceApi = (workspaceId: string) => `/api/w/${workspaceId}`;

export function useStatusAction(workspaceId: string, row: ActionableRow) {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const mutation = useMutation({
    mutationFn: ({ status }: StatusChange) =>
      apiFetch<ObjectStatusResponse>(
        `${workspaceApi(workspaceId)}/meta/objects/${row.id}/status`,
        {
          method: "POST",
          body: {
            adAccountAssetId: row.adAccountId,
            level: row.level,
            status,
            confirm: true,
          } satisfies ObjectStatusRequest,
        },
      ),
    onMutate: ({ status }) =>
      patchRowOptimistically(queryClient, workspaceId, row.id, { status }),
    onError: (_error, _change, rollback) => {
      rollback?.();
      notify({ tone: "error", message: t("metrics.actions.statusError") });
    },
    onSuccess: (_response, { status, previous, undoable }) => {
      if (!undoable) {
        notify({ tone: "info", message: t("metrics.actions.undone") });
        return;
      }
      notify({
        tone: "success",
        message: t(
          status === "PAUSED"
            ? `metrics.actions.paused.${row.level}`
            : `metrics.actions.activated.${row.level}`,
        ),
        action: previous
          ? {
              label: t("toast.undo"),
              onClick: () =>
                mutation.mutate({
                  status: previous,
                  previous: status,
                  undoable: false,
                }),
            }
          : undefined,
      });
    },
  });

  const toggle = () => {
    if (!isWritableStatus(row.status)) return;
    mutation.mutate({
      status: oppositeStatus(row.status),
      previous: row.status,
      undoable: true,
    });
  };

  return { toggle, pending: mutation.isPending };
}

export function useProtectAction(workspaceId: string, row: ActionableRow) {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const mutation = useMutation({
    mutationFn: (protect: boolean) => {
      const url = `${workspaceApi(workspaceId)}/protected-campaigns/${row.id}`;
      return protect
        ? apiFetch<void>(url, {
            method: "PUT",
            body: {
              adAccountAssetId: row.adAccountId,
            } satisfies ProtectCampaignRequest,
          })
        : apiFetch<void>(url, { method: "DELETE" });
    },
    onMutate: (protect) =>
      patchRowOptimistically(queryClient, workspaceId, row.id, {
        protected: protect,
      }),
    onError: (_error, _protect, rollback) => {
      rollback?.();
      notify({ tone: "error", message: t("metrics.actions.protectError") });
    },
    onSuccess: (_response, protect) =>
      notify({
        tone: "success",
        message: t(
          protect ? "metrics.actions.protected" : "metrics.actions.unprotected",
        ),
      }),
  });

  return {
    toggle: () => mutation.mutate(!row.protected),
    pending: mutation.isPending,
  };
}

export function useScaleAction(
  workspaceId: string,
  row: ScalableRow,
  onScaled: () => void,
) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const refreshMetrics = () =>
    queryClient.invalidateQueries({ queryKey: qk.metricsAll(workspaceId) });

  return useMutation({
    mutationFn: (percent: number) =>
      apiFetch<ScaleCampaignResponse>(
        `${workspaceApi(workspaceId)}/meta/campaigns/${row.id}/scale`,
        {
          method: "POST",
          body: {
            adAccountAssetId: row.adAccountId,
            percent,
            expectedCurrentBudgetMinor: row.dailyBudgetMinor,
            confirm: true,
          } satisfies ScaleCampaignRequest,
        },
      ),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "BUDGET_CHANGED")
        void refreshMetrics();
    },
    onSuccess: ({ newBudgetMinor }) => {
      void refreshMetrics();
      notify({
        tone: "success",
        message: `${t("metrics.actions.scaled")} ${formatMoney(newBudgetMinor, row.currency)} ${t("metrics.actions.perDay")}`,
      });
      onScaled();
    },
  });
}
