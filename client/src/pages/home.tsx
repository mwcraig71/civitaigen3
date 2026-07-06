import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import Header from '@/components/header';
import GenerationPanel from '@/components/generation-panel';
import Sidebar from '@/components/sidebar';
import ImageModal from '@/components/image-modal';
import ApiKeySavingsModal from '@/components/api-key-savings-modal';
import WelcomePointsModal from '@/components/welcome-points-modal';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Generation } from '@/types';

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<Generation | null>(null);
  const [showApiKeySavingsModal, setShowApiKeySavingsModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [, setLocation] = useLocation();

  // Scroll to top when the component loads (for navigation from easy mode)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // WebSocket handling moved to generation-panel.tsx
  // Optimistic updates are applied there - no need to refetch here
  // This prevents overwriting optimistically cached images

  // Get all recent generations for navigation - extract from paginated response
  const { data: recentGenerationsResponse } = useQuery<{ generations: Generation[]; hasMore: boolean; total: number }>({
    queryKey: ['/api/generations/recent'],
    refetchIntervalInBackground: false, // Don't refetch when tab is not active
    staleTime: 30000, // Keep data fresh for 30 seconds - optimistic updates handle new images
  });
  const allGenerations = recentGenerationsResponse?.generations ?? [];

  // Get API key status to check platform generation count
  const { data: apiKeyStatus } = useQuery<{ hasApiKey: boolean; platformGenerations: number }>({
    queryKey: ['/api/user/api-key-status'],
  });

  // Show welcome modal for new users
  useEffect(() => {
    try {
      const hasSeenWelcome = localStorage.getItem('hasSeenWelcomeModal');
      if (!hasSeenWelcome) {
        setShowWelcomeModal(true);
        localStorage.setItem('hasSeenWelcomeModal', 'true');
      }
    } catch (error) {
      // Fallback if localStorage is blocked (e.g., in private mode or restrictive settings)
      console.warn('localStorage not available, using session-only welcome control:', error);
      setShowWelcomeModal(true);
    }
  }, []);

  // Show popup after 4 platform generations (without API key)
  useEffect(() => {
    if (apiKeyStatus && !apiKeyStatus.hasApiKey && apiKeyStatus.platformGenerations >= 4) {
      // Only show once per session using localStorage with error handling for Edge compatibility
      try {
        const hasSeenPopup = localStorage.getItem('hasSeenApiKeySavingsPopup');
        if (!hasSeenPopup) {
          setShowApiKeySavingsModal(true);
          localStorage.setItem('hasSeenApiKeySavingsPopup', 'true');
        }
      } catch (error) {
        // Fallback if localStorage is blocked (e.g., in private mode or restrictive settings)
        console.warn('localStorage not available, using session-only popup control:', error);
        setShowApiKeySavingsModal(true);
      }
    }
  }, [apiKeyStatus]);

  const handleBackToFipFap = () => {
    setLocation('/fip-fap');
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white mobile-safe">
      <Header />
      
      {/* Back to Fip Fap Button */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-2">
        <Button
          onClick={handleBackToFipFap}
          variant="outline"
          className="flex items-center gap-2 mb-4"
          data-testid="button-back-to-fip-fap-generate"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fip Fap
        </Button>
      </div>
      
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-4 sm:pb-8 mobile-safe main-content">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          <div className="lg:col-span-2 min-w-0 mobile-safe w-full">
            <GenerationPanel onImageClick={setSelectedImage} />
          </div>
          <div className="hidden lg:block">
            <Sidebar />
          </div>
        </div>
      </div>

      {selectedImage && (
        <ImageModal
          generation={selectedImage}
          allGenerations={allGenerations}
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Welcome Points Modal */}
      <WelcomePointsModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
      />

      {/* API Key Savings Modal */}
      <ApiKeySavingsModal
        isOpen={showApiKeySavingsModal}
        onClose={() => setShowApiKeySavingsModal(false)}
        generationCount={apiKeyStatus?.platformGenerations || 0}
      />
    </div>
  );
}
