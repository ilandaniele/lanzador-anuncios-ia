import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { apiFetch } from "../../lib/api";

export type SessionScope = "logout" | "logout-all";

export function useEndSession(scope: SessionScope) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => apiFetch(`/api/auth/${scope}`, { method: "POST" }),
    onSuccess: async () => {
      await navigate("/login", { replace: true });
      queryClient.clear();
    },
  });
}
