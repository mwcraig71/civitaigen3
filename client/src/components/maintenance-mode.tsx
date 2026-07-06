import { AlertTriangle, Clock, Settings, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaintenanceModeProps {
  onRetry?: () => void;
  message?: string;
}

export function MaintenanceMode({ onRetry, message }: MaintenanceModeProps) {
  const defaultMessage = "We're currently performing scheduled maintenance to improve your experience. We'll be back online shortly.";
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-lg mx-auto text-center">
        <div className="relative mb-8">
          {/* Animated maintenance icons */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Settings 
                className="h-16 w-16 text-purple-400 animate-spin" 
                style={{ animationDuration: '3s' }}
                data-testid="icon-maintenance-settings"
              />
              <Wrench 
                className="h-8 w-8 text-pink-400 absolute -top-2 -right-2 animate-pulse" 
                data-testid="icon-maintenance-wrench"
              />
            </div>
          </div>
          
          {/* Main maintenance heading */}
          <h1 
            className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mb-6"
            data-testid="text-maintenance-title"
          >
            Under Maintenance
          </h1>
        </div>

        {/* Status indicator */}
        <div className="bg-black/20 backdrop-blur rounded-lg p-6 border border-purple-500/20 mb-8">
          <div className="flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-yellow-400 mr-2" data-testid="icon-maintenance-warning" />
            <span className="text-yellow-400 font-semibold" data-testid="text-maintenance-status">
              Service Temporarily Unavailable
            </span>
          </div>
          
          <p 
            className="text-white/80 text-lg leading-relaxed mb-6"
            data-testid="text-maintenance-message"
          >
            {message || defaultMessage}
          </p>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center text-purple-300 mb-4">
            <Clock className="h-5 w-5 mr-2" data-testid="icon-maintenance-clock" />
            <span data-testid="text-maintenance-time">Estimated completion time: Soon</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-4">
          {onRetry && (
            <Button 
              onClick={onRetry}
              variant="outline"
              size="lg"
              className="w-full bg-purple-600/20 border-purple-500 hover:bg-purple-600/30 text-white"
              data-testid="button-maintenance-retry"
            >
              Try Again
            </Button>
          )}
          
          {/* Social/status links */}
          <div className="text-center">
            <p className="text-white/60 text-sm mb-2">
              For updates and assistance, please check back shortly
            </p>
            
            {/* Show contact info only if environment variables are provided */}
            {(import.meta.env.VITE_STATUS_PAGE_URL || import.meta.env.VITE_SUPPORT_URL) && (
              <div className="flex justify-center space-x-4 text-purple-300">
                {import.meta.env.VITE_STATUS_PAGE_URL && (
                  <a 
                    href={import.meta.env.VITE_STATUS_PAGE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-purple-200 transition-colors"
                    data-testid="link-maintenance-status"
                  >
                    Status Page
                  </a>
                )}
                {import.meta.env.VITE_SUPPORT_URL && (
                  <a 
                    href={import.meta.env.VITE_SUPPORT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-purple-200 transition-colors"
                    data-testid="link-maintenance-support"
                  >
                    Support
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-8 text-center">
          <p className="text-white/40 text-xs" data-testid="text-maintenance-footer">
            Thank you for your patience. We're working hard to get back online.
          </p>
        </div>
      </div>
    </div>
  );
}