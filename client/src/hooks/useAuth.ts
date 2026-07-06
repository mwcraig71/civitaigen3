import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { clearDeletedGenerationsForUser } from "@/lib/queryClient";
import type { AuthUser } from "@/types";

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
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