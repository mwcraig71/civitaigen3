import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global persistent store for deleted generation IDs
// This set persists within a single user session - cleared on logout/login
// This is the SINGLE SOURCE OF TRUTH for deletion state
export const deletedGenerationIds = new Set<string>();

// Track current user to detect auth changes
let currentUserId: string | null = null;

// Helper functions for managing deleted IDs
export function markGenerationDeleted(id: string) {
  deletedGenerationIds.add(id);
}

export function markGenerationsDeleted(ids: string[]) {
  ids.forEach(id => deletedGenerationIds.add(id));
}

export function isGenerationDeleted(id: string): boolean {
  return deletedGenerationIds.has(id);
}

// Filter function to remove deleted generations from any array
export function filterDeletedGenerations<T extends { id: string }>(generations: T[]): T[] {
  return generations.filter(gen => !deletedGenerationIds.has(gen.id));
}

// Clear deleted IDs when user changes (logout/login/account switch)
// Call this when auth state changes to prevent cross-user deletion bleed
export function clearDeletedGenerationsForUser(newUserId: string | null) {
  if (newUserId !== currentUserId) {
    console.log(`🧹 Auth change detected (${currentUserId} → ${newUserId}) - clearing deleted generation IDs`);
    deletedGenerationIds.clear();
    currentUserId = newUserId;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Set reasonable stale time instead of Infinity to prevent memory leaks
      // Data will be considered fresh for 5 minutes, then stale
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Garbage collect data after 10 minutes of being unused
      gcTime: 10 * 60 * 1000, // 10 minutes (replaces cacheTime in v5)
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
