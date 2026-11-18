import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import type {
  ApprovePilotProposalRequest,
  ApprovePilotProposalResponse,
  DismissPilotProposalRequest,
  DismissPilotProposalResponse,
  PilotProposalDto,
} from "../../../shared/schemas/pilot";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";
import { isStaleError } from "./approve-errors";
import { removeProposal, replaceProposal } from "./proposal-cache";

export function useSettleProposal(workspaceId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (id: string) => removeProposal(queryClient, workspaceId, id),
    [queryClient, workspaceId],
  );
}

export function useProposalDecisions(
  workspaceId: string,
  proposal: PilotProposalDto,
) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useToast();
  const settle = useSettleProposal(workspaceId);
  const url = `/api/w/${workspaceId}/pilot/proposals/${proposal.id}`;

  const invalidateHistory = () =>
    queryClient.invalidateQueries({ queryKey: qk.pilotHistory(workspaceId) });

  function handleError(error: unknown) {
    if (!isStaleError(error)) return;
    settle(proposal.id);
    notify({ tone: "error", message: t("pilot.stale") });
  }

  const approve = useMutation({
    mutationFn: (body: ApprovePilotProposalRequest) =>
      apiFetch<ApprovePilotProposalResponse>(`${url}/approve`, {
        method: "POST",
        body,
      }),
    onSuccess: ({ proposal: approved, launchId }) => {
      replaceProposal(queryClient, workspaceId, approved);
      void invalidateHistory();
      if (!launchId) return;
      notify({
        tone: "success",
        message: t("pilot.draftCreated"),
        action: {
          label: t("pilot.viewDraft"),
          onClick: () =>
            navigate(workspacePath(workspaceId, `lanzador/${launchId}`)),
        },
      });
    },
    onError: handleError,
  });

  const dismiss = useMutation({
    mutationFn: (body: DismissPilotProposalRequest) =>
      apiFetch<DismissPilotProposalResponse>(`${url}/dismiss`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      settle(proposal.id);
      void invalidateHistory();
      notify({ tone: "info", message: t("pilot.dismissed") });
    },
    onError: handleError,
  });

  return { approve, dismiss };
}
