import { useQuery } from "@tanstack/react-query";

interface SignupStatus {
  blocked: boolean;
}

export function useSignupStatus() {
  return useQuery<SignupStatus>({
    queryKey: ["/api/signups-blocked"],
    refetchInterval: 30000, // Check every 30 seconds for admin changes
    staleTime: 20000, // Consider data stale after 20 seconds
  });
}