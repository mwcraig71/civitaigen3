import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { clearDeletedGenerationsForUser, getQueryFn } from "@/lib/queryClient";
import type { AuthUser } from "@/types";

export function useAuth() {
  // 401 means "not logged in" — resolve to null instead of throwing.
  // A thrown 401 leaves the query in an error state, which TanStack treats
  // as permanently stale: every component mount refetches it, causing a
  // request storm (dozens of /api/auth/user calls per second) that can
  // trip rate limits and keep the app stuck loading.
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  // Clear deleted generation IDs when user changes (login/logout/account switch)
  // This prevents cross-user deletion state bleed
  useEffect(() => {
    clearDeletedGenerationsForUser(user?.id ?? null);
  }, [user?.id]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}