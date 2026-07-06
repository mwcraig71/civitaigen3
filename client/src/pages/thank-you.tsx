import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowLeft, Sparkles, Gift, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PaymentVerificationResult {
  success: boolean;
  message: string;
  newBalance?: number;
  creditsAdded?: number;
  packageName?: string;
  alreadyProcessed?: boolean;
  status?: string;
}

export default function ThankYouPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<PaymentVerificationResult | null>(null);
  const [npId, setNpId] = useState<string | null>(null);

  // Bulletproof payment verification function
  const verifyPayment = async (paymentId: string) => {
    try {
      setIsVerifying(true);
      console.log('🔍 Verifying payment with ID:', paymentId);
      
      const response = await apiRequest("POST", "/api/verify-payment", { npId: paymentId });
      const result = await response.json();
      
      console.log('📊 Payment verification result:', result);
      setVerificationResult(result);
      
      if (result.success) {
        if (result.alreadyProcessed) {
          toast({
            title: "Payment Already Processed",
            description: "Your credits were already added to your account.",
            duration: 5000,
          });
        } else {
          toast({
            title: "Credits Added Successfully! 🎉",
            description: `${result.creditsAdded} credits from ${result.packageName} have been added to your account.`,
            duration: 8000,
          });
        }
      } else {
        toast({
          title: "Payment Verification Issue",
          description: result.message || "Unable to verify payment status. Please contact support if needed.",
          variant: "destructive",
          duration: 10000,
        });
      }
    } catch (error: any) {
      console.error('❌ Payment verification error:', error);
      setVerificationResult({
        success: false,
        message: "Failed to verify payment. Please try again or contact support."
      });
      toast({
        title: "Verification Error",
        description: "Unable to verify your payment. Please refresh the page or contact support.",
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    
    // Parse URL parameters to get payment ID
    const urlParams = new URLSearchParams(window.location.search);
    const paymentId = urlParams.get('NP_id') || urlParams.get('np_id') || urlParams.get('payment_id');
    
    console.log('🔍 URL parameters:', Object.fromEntries(urlParams.entries()));
    console.log('💳 Payment ID found:', paymentId);
    
    if (paymentId) {
      setNpId(paymentId);
      // Automatically verify payment when page loads
      verifyPayment(paymentId);
    } else {
      // Check localStorage for payment data (fallback)
      const storedPaymentId = localStorage.getItem('lastPaymentId');
      if (storedPaymentId) {
        console.log('💾 Found stored payment ID:', storedPaymentId);
        setNpId(storedPaymentId);
        verifyPayment(storedPaymentId);
      } else {
        // No payment ID found - show generic success message
        console.log('⚠️ No payment ID found in URL or localStorage');
        setVerificationResult({
          success: true,
          message: "Purchase completed successfully"
        });
      }
    }
    
    // Add Tapfiliate tracking (existing functionality)
    const addTapfiliateScripts = () => {
      const stripeCustomerId = localStorage.getItem('lastStripeCustomerId');
      const stripeChargeId = localStorage.getItem('lastStripeChargeId');
      const orderAmount = localStorage.getItem('lastOrderAmount');
      
      if (stripeCustomerId && stripeChargeId && orderAmount) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.innerHTML = `
          (function(t,a,p){t.TapfiliateObject=a;t[a]=t[a]||function(){
          (t[a].q=t[a].q||[]).push(arguments)}})(window,'tap');
          tap('create', '61439-a970d0', { integration: "stripe" });
          tap('conversion', '${stripeChargeId}', ${parseFloat(orderAmount)}, {customer_id: '${stripeCustomerId}'});
        `;
        document.head.appendChild(script);
        
        // Clean up stored data
        localStorage.removeItem('lastStripeCustomerId');
        localStorage.removeItem('lastStripeChargeId');
        localStorage.removeItem('lastOrderAmount');
      }
    };
    
    setTimeout(addTapfiliateScripts, 1000);
  }, []);

  const handleRetryVerification = () => {
    if (npId) {
      verifyPayment(npId);
    }
  };

  const handleBackToEasyMode = () => {
    setLocation("/easy-mode");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header with verification status */}
          <div className="text-center mb-8">
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full mb-6">
              {isVerifying ? (
                <>
                  <div className="bg-blue-500/20 rounded-full w-full h-full flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping"></div>
                </>
              ) : verificationResult?.success ? (
                <>
                  <div className="bg-green-500/20 rounded-full w-full h-full flex items-center justify-center">
                    <CheckCircle className="w-12 h-12 text-green-400" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-green-400/20 animate-ping"></div>
                </>
              ) : (
                <>
                  <div className="bg-orange-500/20 rounded-full w-full h-full flex items-center justify-center">
                    <AlertCircle className="w-12 h-12 text-orange-400" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-orange-400/20 animate-ping"></div>
                </>
              )}
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {isVerifying ? (
                <span className="bg-gradient-to-r from-blue-400 to-cyan-600 bg-clip-text text-transparent">
                  Verifying Payment...
                </span>
              ) : verificationResult?.success ? (
                <span className="bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">
                  Thank You!
                </span>
              ) : (
                <span className="bg-gradient-to-r from-orange-400 to-yellow-600 bg-clip-text text-transparent">
                  Payment Status
                </span>
              )}
            </h1>
            
            <p className="text-xl text-gray-300 mb-2">
              {isVerifying ? (
                "Please wait while we verify your payment..."
              ) : verificationResult?.success ? (
                verificationResult.alreadyProcessed ? "Payment already processed" : "Your purchase was successful"
              ) : (
                "Checking payment status"
              )}
            </p>
            
            {verificationResult && !isVerifying && (
              <p className="text-gray-400">
                {verificationResult.success ? (
                  <>
                    {verificationResult.creditsAdded && verificationResult.creditsAdded > 0 ? (
                      <>✅ {verificationResult.creditsAdded} credits have been added to your account!</>
                    ) : (
                      <>Your credits are ready for creating amazing AI art!</>
                    )}
                    {verificationResult.newBalance && (
                      <span className="block mt-1 text-green-400 font-semibold">
                        Current balance: {verificationResult.newBalance} credits
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {verificationResult.message}
                    {npId && (
                      <span className="block mt-1 text-xs text-gray-500">
                        Payment ID: {npId}
                      </span>
                    )}
                  </>
                )}
              </p>
            )}
          </div>

          {/* Status Card */}
          <Card className={`backdrop-blur mb-8 ${
            isVerifying ? 'bg-black/40 border-blue-500/20' : 
            verificationResult?.success ? 'bg-black/40 border-green-500/20' : 
            'bg-black/40 border-orange-500/20'
          }`} data-testid="thank-you-card">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    <CardTitle className="text-blue-400">Verifying Payment</CardTitle>
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  </>
                ) : verificationResult?.success ? (
                  <>
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                    <CardTitle className="text-green-400">
                      {verificationResult.alreadyProcessed ? "Already Processed" : "Purchase Complete"}
                    </CardTitle>
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-orange-400" />
                    <CardTitle className="text-orange-400">Verification Needed</CardTitle>
                    <AlertCircle className="w-5 h-5 text-orange-400" />
                  </>
                )}
              </div>
              <CardDescription className="text-gray-300">
                {isVerifying ? (
                  "We're confirming your payment with our secure payment processor..."
                ) : verificationResult?.success ? (
                  verificationResult.alreadyProcessed ? 
                    "Your credits were already added to your account" :
                    "You can now start generating images with your new credits"
                ) : (
                  "Please try verifying your payment again or contact support if the issue persists"
                )}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {!isVerifying && verificationResult && !verificationResult.success && (
                /* Retry verification section */
                <div className="text-center p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <h3 className="text-lg font-semibold text-orange-300 mb-2">Payment Verification Failed</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    {verificationResult.message}
                  </p>
                  <Button 
                    onClick={handleRetryVerification}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    data-testid="button-retry-verification"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Verification
                  </Button>
                </div>
              )}

              {(!isVerifying && verificationResult?.success) && (
                /* What's Next Section - only show when verification successful */
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-purple-400" />
                    What's Next?
                  </h3>
                  
                  <div className="grid gap-4">
                    <div className="flex items-start gap-3 p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                      <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-medium text-white mb-1">Start Creating</h4>
                        <p className="text-sm text-gray-400">Use Easy Mode for quick generation or the Advanced Generator for full control</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-medium text-white mb-1">Explore Models</h4>
                        <p className="text-sm text-gray-400">Browse our collection of AI models and LoRAs for different art styles</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                      <div className="w-2 h-2 rounded-full bg-green-400 mt-2 flex-shrink-0"></div>
                      <div>
                        <h4 className="font-medium text-white mb-1">Create Characters</h4>
                        <p className="text-sm text-gray-400">Build custom character profiles for consistent image generation</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(isVerifying) && (
                /* Loading state */
                <div className="text-center p-6">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Verifying your payment with NOWPayments...</p>
                  <p className="text-xs text-gray-500 mt-2">This usually takes a few seconds</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons - only show when not verifying */}
          {!isVerifying && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={handleBackToEasyMode}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-3"
                data-testid="button-back-to-easy-mode"
                disabled={!verificationResult?.success}
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Start Creating in Easy Mode
              </Button>
              
              <Button 
                onClick={() => setLocation("/generate")}
                variant="outline"
                size="lg"
                className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white px-8 py-3"
                data-testid="button-advanced-generator"
                disabled={!verificationResult?.success}
              >
                Advanced Generator
              </Button>
            </div>
          )}

          {/* Support Message */}
          <div className="text-center mt-8 p-4 bg-black/20 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-400">
              {verificationResult && !verificationResult.success ? (
                <>
                  Having trouble with your payment?{" "}
                  <button 
                    onClick={() => setLocation("/feedback")}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Contact Support
                  </button>
                  {npId && (
                    <>
                      {" "}with payment ID: <code className="bg-gray-800 px-1 rounded text-xs">{npId}</code>
                    </>
                  )}
                </>
              ) : (
                <>
                  Need help? Check out our{" "}
                  <button 
                    onClick={() => setLocation("/feedback")}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Support Center
                  </button>
                  {" "}or{" "}
                  <button 
                    onClick={() => setLocation("/settings")}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Account Settings
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}