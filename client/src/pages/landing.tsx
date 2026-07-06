import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Zap, Users, Star, AlertTriangle, Ban, LogIn } from "lucide-react";
import { Link } from "wouter";
import { useSignupStatus } from "@/hooks/use-signup-status";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const { data: signupStatus, isLoading: signupStatusLoading } = useSignupStatus();
  const signupsBlocked = signupStatus?.blocked;
  const [demoLoading, setDemoLoading] = useState(false);
  const { toast } = useToast();

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const response = await fetch('/api/demo-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast({
          title: "Demo Mode Activated",
          description: "Welcome! You're now using a demo account with 48 Buzz credits.",
        });
        // Redirect to the main app
        window.location.href = "/";
      } else {
        throw new Error('Demo login failed');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start demo mode. Please try again.",
        variant: "destructive"
      });
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            CiviVerse.com
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Create stunning Adult AI-generated artwork with advanced models, LoRAs, and community features. 
            Join thousands of creators building the future of digital art.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="text-lg px-8 py-3"
              onClick={() => {
                if (!signupsBlocked) {
                  window.location.href = "/api/login";
                }
              }}
              disabled={signupStatusLoading || signupsBlocked}
              data-testid="button-login"
            >
              {signupStatusLoading ? (
                "Loading..."
              ) : signupsBlocked ? (
                <>
                  <Ban className="mr-2 h-5 w-5" />
                  Signups Temporarily Disabled
                </>
              ) : (
                <>
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
            {signupsBlocked && (
              <Button 
                size="lg"
                variant="outline"
                className="text-lg px-8 py-3"
                onClick={() => {
                  window.location.href = "/api/login";
                }}
                data-testid="button-existing-member-login"
              >
                <LogIn className="mr-2 h-5 w-5" />
                Existing Member? Log In
              </Button>
            )}
{/* Demo button temporarily disabled
            <Button 
              size="lg"
              variant="outline"
              className="text-lg px-8 py-3"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              data-testid="button-demo-login"
            >
              {demoLoading ? "Starting Demo..." : "Try Demo - No Account Needed"}
            </Button>
*/}
          </div>
        </div>

        {/* Beta Disclaimer */}
        <div className="mb-16">
          <Card className="max-w-4xl mx-auto border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                    Beta Platform Notice
                  </h3>
                  <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                    CiviVerse is currently in beta testing. While we strive to provide a reliable service, 
                    this platform is experimental and may experience unexpected issues, data loss, or service interruptions. 
                    By using this service, you acknowledge that you do so at your own risk. The platform owners and operators 
                    cannot be held liable for any damages, losses, or issues that may arise from your use of this beta service.
                    We appreciate your participation in helping us improve the platform.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="mr-2 h-5 w-5 text-blue-600" />
                Advanced Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Access powerful AI models, LoRAs, and customization options for professional-quality image generation.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5 text-purple-600" />
                Community Driven
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Share your creations, discover inspiration, and collaborate with a vibrant community of AI artists.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Star className="mr-2 h-5 w-5 text-green-600" />
                Professional Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Character management, scene building, and advanced prompt crafting tools for serious creators.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Ready to Create?</CardTitle>
              <CardDescription>
                {signupsBlocked ? (
                  <>
                    <AlertTriangle className="inline h-4 w-4 mr-1 text-orange-500" />
                    New user registrations are currently disabled. Please check back later.
                  </>
                ) : (
                  "Sign up now and get 300 free Buzz credits to start generating amazing artwork, plus 300 additional Buzz every month until 2026!"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => {
                  if (!signupsBlocked) {
                    window.location.href = "/api/login";
                  }
                }}
                disabled={signupStatusLoading || signupsBlocked}
                data-testid="button-signup"
              >
                {signupStatusLoading ? (
                  "Loading..."
                ) : signupsBlocked ? (
                  <>
                    <Ban className="mr-2 h-4 w-4" />
                    Signups Temporarily Disabled
                  </>
                ) : (
                  "Sign Up & Start Creating"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-muted text-center">
          <div className="space-y-4">
            <div className="flex justify-center space-x-8 text-sm text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">
                Terms & Conditions
              </Link>
              <a 
                href="https://civiverse.tapfiliate.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors" 
                data-testid="link-affiliate"
              >
                Affiliate Program
              </a>
            </div>
            <div className="text-xs text-muted-foreground">
              © 2025 CiviVerse. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}