import { useQuery, type QueryKey } from "@tanstack/react-query";

type ServerPaced = { nextPollMs: number | null };

export const VISIBLE_POLL_MS = 60_000;

export const useServerPolling = <T extends ServerPaced>(
  queryKey: QueryKey,
  fn: () => Promise<T>,
) =>
  useQuery({
    queryKey,
    queryFn: fn,
    refetchInterval: (query) => query.state.data?.nextPollMs ?? false,
  });

export const useVisiblePolling = <T>(
  queryKey: QueryKey,
  fn: () => Promise<T>,
  intervalMs: number = VISIBLE_POLL_MS,
) =>
  useQuery({
    queryKey,
    queryFn: fn,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
