import { useQuery } from "@tanstack/react-query";
import type { Me } from "../../../shared/schemas/auth";
import { ApiError, apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

async function fetchMe(): Promise<Me | null> {
  try {
    return await apiFetch<Me>("/api/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const useMe = () => useQuery({ queryKey: qk.me(), queryFn: fetchMe });
