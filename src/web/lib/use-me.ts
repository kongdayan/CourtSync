import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

interface MeResponse {
  user: { id: string; email: string; name: string | null; image?: string | null };
  access: { role: string; status: string; ruleLimit: number };
}

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: () => apiFetch("/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
