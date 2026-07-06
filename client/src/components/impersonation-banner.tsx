import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

export function ImpersonationBanner() {
  const { data: status } = useQuery<{
    isImpersonating: boolean;
    adminUsername?: string;
    targetUser?: {
      id: string;
      username: string;
      displayName: string | null;
    };
  }>({
    queryKey: ['/api/admin/impersonation-status'],
    refetchInterval: false,
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/stop-impersonate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/impersonation-status'] });
      window.location.href = '/admin';
    },
  });

  if (!status?.isImpersonating) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white px-4 py-2 relative z-50">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span className="font-semibold text-sm">
            Impersonating: {status.targetUser?.displayName || status.targetUser?.username || 'Unknown'}
          </span>
          <span className="text-xs opacity-80">
            (@{status.targetUser?.username})
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="bg-white text-orange-600 hover:bg-gray-100 text-xs"
          onClick={() => stopMutation.mutate()}
          disabled={stopMutation.isPending}
        >
          {stopMutation.isPending ? "Returning..." : "Stop Impersonating"}
        </Button>
      </div>
    </div>
  );
}
