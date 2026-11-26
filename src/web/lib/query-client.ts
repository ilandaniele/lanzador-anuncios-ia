import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { qk } from "./query-keys";

const MAX_RETRIES = 2;

function shouldRetry(failureCount: number, error: Error): boolean {
  const isClientError =
    error instanceof ApiError && error.status >= 400 && error.status < 500;
  return !isClientError && failureCount < MAX_RETRIES;
}

const isPaymentRequired = (error: Error) =>
  error instanceof ApiError && error.code === "PAYMENT_REQUIRED";

export function createQueryClient(): QueryClient {
  const refreshMeOnPaymentRequired = (error: Error) => {
    if (isPaymentRequired(error))
      void queryClient.invalidateQueries({ queryKey: qk.me() });
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: refreshMeOnPaymentRequired }),
    mutationCache: new MutationCache({ onError: refreshMeOnPaymentRequired }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
    },
  });
  return queryClient;
}
