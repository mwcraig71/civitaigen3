import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/types";

interface MaintenanceStatus {
  enabled: boolean;
  setting: {
    key: string;
    value: string;
    description?: string;
    updatedBy: string;
    updatedAt: string;
  } | null;
  message: string;
}

export function useMaintenanceMode() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Always check maintenance status - don't wait for authentication
  const { data: maintenanceStatus, isLoading, error, refetch } = useQuery<MaintenanceStatus>({
    queryKey: ['/api/system/maintenance-status'],
    // Always enabled - we need to check maintenance status regardless of auth state
    enabled: true,
    retry: 3,
    retryDelay: 1000,
    // Custom queryFn to handle the response properly
    queryFn: async () => {
      const response = await fetch('/api/system/maintenance-status', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        // If we get a 503 response, maintenance mode is probably active
        if (response.status === 503) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.maintenanceMode) {
            return {
              enabled: true,
              setting: null,
              message: errorData.message || 'Service under maintenance'
            };
          }
        }
        // For 403 (admin required) or other auth errors, assume maintenance is disabled
        // This allows non-admin users to continue if maintenance endpoint requires admin auth
        if (response.status === 403) {
          return {
            enabled: false,
            setting: null,
            message: 'Maintenance check requires admin access'
          };
        }
        throw new Error(`Failed to check maintenance status: ${response.status}`);
      }
      
      return response.json();
    }
  });

  // Determine if maintenance mode should block this user
  // Block if maintenance is enabled AND user is not an admin (or user status is unknown/unauthenticated)
  const shouldBlockUser = maintenanceStatus?.enabled && 
                          (!isAuthenticated || !user || !(user as User).isAdmin);

  // Determine if we should show maintenance screen
  const showMaintenanceScreen = shouldBlockUser;

  return {
    isMaintenanceEnabled: maintenanceStatus?.enabled || false,
    maintenanceMessage: maintenanceStatus?.message,
    shouldBlockUser,
    showMaintenanceScreen,
    isLoading,
    error,
    refetch,
    maintenanceStatus
  };
}