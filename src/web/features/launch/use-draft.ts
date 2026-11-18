import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LaunchDetailResponse,
  LaunchDto,
  PartialLaunchDraft,
} from "../../../shared/schemas/launch";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

export const AUTOSAVE_DEBOUNCE_MS = 1000;

export type SaveState = "saved" | "saving" | "offline" | "failed";

const launchesApi = (workspaceId: string) => `/api/w/${workspaceId}/launches`;

export const useLaunch = (workspaceId: string, launchId: string) =>
  useQuery({
    queryKey: qk.launch(workspaceId, launchId),
    queryFn: () =>
      apiFetch<LaunchDetailResponse>(`${launchesApi(workspaceId)}/${launchId}`),
  });

export const useCreateDraft = (workspaceId: string) =>
  useMutation({
    mutationFn: async () =>
      (
        await apiFetch<{ launch: LaunchDto }>(launchesApi(workspaceId), {
          method: "POST",
          body: { draft: {} },
        })
      ).launch,
  });

function toSaveState(
  pending: boolean,
  save: { isPending: boolean; isError: boolean; error: Error | null },
): SaveState {
  if (pending || save.isPending) return "saving";
  if (!save.isError) return "saved";
  return save.error instanceof ApiError ? "failed" : "offline";
}

export function useDraftAutosave(
  workspaceId: string,
  launchId: string,
  initial: PartialLaunchDraft,
) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const send = useCallback(
    async (body: PartialLaunchDraft) => {
      await apiFetch(`${launchesApi(workspaceId)}/${launchId}`, {
        method: "PATCH",
        body: { draft: body },
      });
      void queryClient.invalidateQueries({
        queryKey: qk.launch(workspaceId, launchId),
      });
    },
    [queryClient, workspaceId, launchId],
  );
  const save = useMutation({ mutationFn: send });
  const { mutate } = save;

  const flush = useCallback(() => {
    timer.current = undefined;
    setPending(false);
    mutate(latest.current);
  }, [mutate]);

  const update = useCallback(
    (changes: PartialLaunchDraft) => {
      latest.current = { ...latest.current, ...changes };
      setDraft(latest.current);
      setPending(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const retryWhenOnline = () => {
      if (save.isError) mutate(latest.current);
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [save.isError, mutate]);

  useEffect(
    () => () => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      send(latest.current).catch(() => undefined);
    },
    [send],
  );

  return { draft, update, saveState: toSaveState(pending, save) };
}
