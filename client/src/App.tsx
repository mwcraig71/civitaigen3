import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useAgeVerification } from "@/hooks/useAgeVerification";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { AgeVerificationModal } from "@/components/age-verification-modal";
import { MaintenanceMode } from "@/components/maintenance-mode";
import { lazy, Suspense, Component, useEffect, type ReactNode } from "react";
import { apiRequest } from "./lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTracking } from "@/lib/tracking";
import { DemoBanner } from "@/components/demo-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { BuyBuzzPopup } from "@/components/buy-buzz-popup";

// Lazy load page components to reduce initial bundle size
const Home = lazy(() => import("@/pages/home"));
const Models = lazy(() => import("@/pages/models"));
const Generations = lazy(() => import("@/pages/generations"));
const EnhancedImages = lazy(() => import("@/pages/enhanced-images"));
const Favorites = lazy(() => import("@/pages/favorites"));
const Characters = lazy(() => import("@/pages/characters"));
const SceneBuilder = lazy(() => import("@/pages/scene-builder"));
const Events = lazy(() => import("@/pages/events"));
const EasyMode = lazy(() => import("@/pages/easy-mode"));
const Settings = lazy(() => import("@/pages/settings"));
const Profile = lazy(() => import("@/pages/profile"));
const Community = lazy(() => import("@/pages/community"));
const FipFap = lazy(() => import("@/pages/fip-fap"));
const BuyCredits = lazy(() => import("@/pages/buy-credits"));
// Removed: Checkout page consolidated into buy-credits flow
const Admin = lazy(() => import("@/pages/admin"));
const Feedback = lazy(() => import("@/pages/feedback"));
const SavedPrompts = lazy(() => import("@/pages/saved-prompts"));
const PromptCreator = lazy(() => import("@/pages/prompt-creator"));
const Transform = lazy(() => import("@/pages/transform"));
const Terms = lazy(() => import("@/pages/terms"));
const ThankYou = lazy(() => import("@/pages/thank-you"));
const Landing = lazy(() => import("@/pages/landing"));
const ApiDocs = lazy(() => import("@/pages/api-docs"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading fallback component
function PageLoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">Loading...</p>
      </div>
    </div>
  );
}

// Capture ?ref=CODE from invite links before auth redirects strip it.
try {
  const refCode = new URLSearchParams(window.location.search).get('ref');
  if (refCode && /^[A-Z2-9]{8}$/i.test(refCode)) {
    localStorage.setItem('pendingReferralCode', refCode.toUpperCase());
  }
} catch {
  // localStorage unavailable (private mode) — referral capture is best-effort
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  // Redeem a captured referral code once the user is signed in.
  useEffect(() => {
    if (!isAuthenticated) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem('pendingReferralCode');
    } catch {
      return;
    }
    if (!pending) return;
    apiRequest('POST', '/api/referral/redeem', { code: pending })
      .then(async (response) => {
        const data = await response.json();
        if (data?.reward) {
          queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
          toast({
            title: `+${data.reward} Buzz!`,
            description: 'Welcome bonus from your invite link.',
          });
        }
      })
      .catch(() => {
        // Invalid/expired/already-used — drop silently
      })
      .finally(() => {
        try {
          localStorage.removeItem('pendingReferralCode');
        } catch {
          // ignore
        }
      });
  }, [isAuthenticated, toast]);
  const { isVerified, isLoading: isAgeLoading, setVerified, handleDecline } = useAgeVerification();
  const { showMaintenanceScreen, maintenanceMessage, refetch, isLoading: maintenanceLoading } = useMaintenanceMode();
  
  // Track page navigation for admin monitoring
  usePageTracking();
  
  // Get user data to check preferences
  const { data: user } = useQuery<{ defaultLandingPage?: string }>({
    queryKey: ['/api/auth/user'],
    enabled: isAuthenticated && !isLoading,
  });

  // Show loading fallback while checking maintenance status to prevent content flash
  if (maintenanceLoading) {
    return <PageLoadingFallback />;
  }

  // Show maintenance screen for non-admin users when maintenance mode is enabled
  if (showMaintenanceScreen) {
    return (
      <MaintenanceMode 
        message={maintenanceMessage}
        onRetry={() => {
          // Refetch maintenance status when user clicks retry
          refetch();
        }}
      />
    );
  }

  // Show age verification page if user hasn't verified their age
  if (!isAgeLoading && !isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* SEO-optimized age verification page */}
        <div className="container mx-auto px-4 py-8">
          <header className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mb-4">
              CiviVerse - Adult Porn AI Image Generation Platform
            </h1>
            <h2 className="text-xl md:text-2xl text-white mb-6">
              Professional AI Image Generation with Advanced Models & LoRAs
            </h2>
          </header>

          <main className="max-w-4xl mx-auto">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-4">Platform Features</h2>
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="bg-black/20 backdrop-blur rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Advanced AI Models</h3>
                  <p className="text-gray-300 mb-3">Access cutting-edge AI models including Stable Diffusion, custom LoRAs, and community-trained checkpoints for professional image generation.</p>
                  <a 
                    href="https://civitai.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium"
                  >
                    Explore Models at CivitAI →
                  </a>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Character Creation</h3>
                  <p className="text-gray-300">Build detailed character profiles with custom prompts, settings, and LoRA configurations for consistent character generation.</p>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Scene Builder</h3>
                  <p className="text-gray-300">Comprehensive scene composition tools with location, outfit, pose, and lighting options for creating detailed artwork.</p>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Community Features</h3>
                  <p className="text-gray-300">Share your creations, discover community art, and collaborate with other artists in our growing creative platform.</p>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Free AI Porn Images</h3>
                  <p className="text-gray-300">Generate unlimited adult content with our free AI image generation tools and extensive model library.</p>
                </div>
              </div>
            </section>

            <nav className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4">Quick Navigation</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-black/20 backdrop-blur rounded-lg p-4">
                  <span className="text-blue-400">🎨 Easy Mode</span>
                  <p className="text-sm text-gray-400 mt-1">Simple AI generation</p>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-4">
                  <span className="text-green-400">🏗️ Advanced Generator</span>
                  <p className="text-sm text-gray-400 mt-1">Full control interface</p>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-4">
                  <span className="text-purple-400">👥 Characters</span>
                  <p className="text-sm text-gray-400 mt-1">Character management</p>
                </div>
                <div className="bg-black/20 backdrop-blur rounded-lg p-4">
                  <span className="text-yellow-400">🌟 Community</span>
                  <p className="text-sm text-gray-400 mt-1">Shared artwork</p>
                </div>
              </div>
            </nav>
          </main>
        </div>
        
        <AgeVerificationModal
          isOpen={true}
          onVerified={setVerified}
          onDeclined={handleDecline}
        />
      </div>
    );
  }

  // Show loading state while checking age verification
  if (isAgeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ImpersonationBanner />
      <DemoBanner />
      <BuyBuzzPopup isAuthenticated={isAuthenticated && !isLoading} />
      <Suspense fallback={<PageLoadingFallback />}>
        <Switch>
        {/* Public routes - always accessible */}
        <Route path="/thank-you" component={ThankYou} />
        <Route path="/terms" component={Terms} />
        <Route path="/api-docs" component={ApiDocs} />
        
        {isLoading || !isAuthenticated ? (
          <>
            <Route path="/" component={Landing} />
            {/* Redirect any protected route to landing when not authenticated */}
            <Route path="/:rest*">{() => <Redirect to="/" />}</Route>
          </>
        ) : (
          <>
            <Route path="/" component={FipFap} />
            <Route path="/generate" component={Home} />
            <Route path="/models" component={Models} />
            <Route path="/generations" component={Generations} />
            <Route path="/enhanced-images" component={EnhancedImages} />
            <Route path="/favorites" component={Favorites} />
            <Route path="/characters" component={Characters} />
            <Route path="/scene-builder" component={SceneBuilder} />
            <Route path="/events" component={Events} />
            <Route path="/easy-mode" component={EasyMode} />
            <Route path="/settings" component={Settings} />
            <Route path="/profile/:id" component={Profile} />
            <Route path="/profile" component={Profile} />
            <Route path="/community" component={Community} />
            <Route path="/fip-fap" component={FipFap} />
            <Route path="/buy-credits" component={BuyCredits} />
            {/* Removed: /checkout route - consolidated into /buy-credits */}
            <Route path="/admin" component={Admin} />
            <Route path="/feedback" component={Feedback} />
            <Route path="/saved-prompts" component={SavedPrompts} />
            <Route path="/prompt-creator" component={PromptCreator} />
            <Route path="/transform" component={Transform} />
          </>
        )}
        <Route path="*" component={NotFound} />
      </Switch>
    </Suspense>
    </>
  );
}

class TooltipErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.children;
    }
    return <TooltipProvider>{this.props.children}</TooltipProvider>;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipErrorBoundary>
        <Toaster />
        <Router />
      </TooltipErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
