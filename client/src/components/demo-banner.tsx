import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useState } from 'react';

export function DemoBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  
  // Only show banner for demo user
  const isDemoUser = user?.id === 'demo_user_fixed_id';
  
  if (!isDemoUser || dismissed) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-orange-600 to-pink-600 text-white px-4 py-3 relative">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex-1 text-center sm:text-left">
          <span className="font-semibold">🎨 Demo Mode</span>
          {' - '}
          <span>You're using a shared demo account. </span>
          <span className="hidden sm:inline">Sign up to save your creations and get more credits!</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white text-orange-600 hover:bg-gray-100"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-upgrade-account"
          >
            Create Account
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            data-testid="button-dismiss-banner"
            aria-label="Dismiss banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
