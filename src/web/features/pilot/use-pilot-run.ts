import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PilotRunDto,
  PilotRunResponse,
} from "../../../shared/schemas/pilot";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

const pilotApi = (workspaceId: string) => `/api/w/${workspaceId}/pilot`;

export const useLastPilotRun = (workspaceId: string) =>
  useQuery({
    queryKey: qk.pilotLastRun(workspaceId),
    queryFn: async () => {
      const page = await apiFetch<{ data: PilotRunDto[] }>(
        `${pilotApi(workspaceId)}/runs?limit=1`,
      );
      return page.data[0] ?? null;
    },
  });

function runErrorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "RATE_LIMITED") return t("pilot.runTooSoon");
  if (code === "RUN_IN_PROGRESS") return t("pilot.runInProgress");
  return t("pilot.runFailed");
}

export function useRunPilot(workspaceId: string) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const invalidate = (queryKey: readonly unknown[]) =>
    queryClient.invalidateQueries({ queryKey });

  return useMutation({
    mutationFn: () =>
      apiFetch<PilotRunResponse>(`${pilotApi(workspaceId)}/run`, {
        method: "POST",
      }),
    onSuccess: ({ proposals }) => {
      void invalidate(qk.pilotLastRun(workspaceId));
      void invalidate(qk.pilotPending(workspaceId));
      void invalidate(qk.today(workspaceId));
      notify({
        tone: "success",
        message: `${t("pilot.runDone")} ${proposals.length}`,
      });
    },
    onError: (error) => {
      void invalidate(qk.pilotLastRun(workspaceId));
      notify({ tone: "error", message: runErrorMessage(error) });
    },
  });
}
