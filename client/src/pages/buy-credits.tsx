import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CreditPackage } from "@shared/schema";
import { Coins, Star, ArrowLeft, CreditCard, Sparkles, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface CryptoPaymentProps {
  selectedPackage: CreditPackage;
  onSuccess: () => void;
  onCancel: () => void;
}

const CryptoPayment = ({ selectedPackage, onSuccess, onCancel }: CryptoPaymentProps) => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const queryClient = useQueryClient();

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      console.log('🚀 Creating NOWPayments invoice for package:', selectedPackage.id);
      const response = await apiRequest("POST", "/api/create-payment-intent", { packageId: selectedPackage.id });
      console.log('📡 Server response status:', response.status);
      const data = await response.json();
      console.log('📦 Server response data:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('✅ NOWPayments invoice created, opening payment page:', data.invoiceUrl);
      
      // Store data for Tapfiliate tracking (using NOWPayments format)
      if (data.orderId) {
        console.log('💾 Storing Tapfiliate data in localStorage:', {
          customerId: `nowpayments_${data.orderId}`,
          chargeId: `np_${data.invoiceId}`,
          amount: selectedPackage.price / 100
        });
        
        localStorage.setItem('lastStripeCustomerId', `nowpayments_${data.orderId}`);
        localStorage.setItem('lastStripeChargeId', `np_${data.invoiceId}`);
        localStorage.setItem('lastOrderAmount', (selectedPackage.price / 100).toString());
        
        // Verify data was stored
        console.log('✅ Data stored successfully:', {
          customerId: localStorage.getItem('lastStripeCustomerId'),
          chargeId: localStorage.getItem('lastStripeChargeId'),
          amount: localStorage.getItem('lastOrderAmount')
        });
      }
      
      // Store payment URL for retry functionality
      setPaymentUrl(data.invoiceUrl);
      
      // Store payment ID for fallback verification (critical for 3-layer system)
      localStorage.setItem('lastPaymentId', data.invoiceId);
      
      // Reset processing state
      setIsProcessing(false);
      
      // Try to open payment popup with mobile-friendly parameters
      openPaymentWindow(data.invoiceUrl);
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
      setIsProcessing(false);
    },
  });

  // Mobile-friendly payment window opener
  const openPaymentWindow = (url: string) => {
    console.log('🌐 Opening payment page with mobile-friendly parameters:', url);
    
    // Enhanced popup parameters for better mobile compatibility
    const windowFeatures = [
      'popup=yes',
      'width=800',
      'height=600',
      'left=' + (window.screen.width / 2 - 400),
      'top=' + (window.screen.height / 2 - 300),
      'scrollbars=yes',
      'resizable=yes',
      'toolbar=no',
      'menubar=no',
      'location=no',
      'status=no'
    ].join(',');
    
    const paymentWindow = window.open(url, 'nowpayments_payment', windowFeatures);
    
    if (!paymentWindow || paymentWindow.closed || typeof paymentWindow.closed === 'undefined') {
      // Popup was blocked, show retry option
      console.log('❌ Popup blocked, showing retry option');
      setShowRetryButton(true);
      toast({
        title: "Payment Window Blocked",
        description: "Your browser blocked the payment popup. Use the 'Open Payment Window' button below to complete your payment.",
        duration: 8000,
      });
    } else {
      setShowRetryButton(false);
      toast({
        title: "Payment Window Opened",
        description: "Complete your cryptocurrency payment in the popup window to receive your credits.",
        duration: 5000,
      });
      
      // Monitor if window gets closed without payment
      const checkClosed = setInterval(() => {
        if (paymentWindow.closed) {
          clearInterval(checkClosed);
          setShowRetryButton(true);
        }
      }, 1000);
      
      // Stop checking after 5 minutes
      setTimeout(() => clearInterval(checkClosed), 300000);
    }
  };

  const handlePayNow = async () => {
    setIsProcessing(true);
    setShowRetryButton(false);
    await createInvoiceMutation.mutateAsync();
  };

  const handleRetryPayment = () => {
    if (paymentUrl) {
      openPaymentWindow(paymentUrl);
    }
  };

  return (
    <div className="max-w-md mx-auto" data-testid="crypto-payment-form">
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2" data-testid="selected-package-name">{selectedPackage.name}</h3>
        <div className="flex items-center justify-between">
          <span data-testid="package-credits">{selectedPackage.credits + (selectedPackage.bonusCredits || 0)} Buzz Credits</span>
          <span className="font-bold" data-testid="package-price">${(selectedPackage.price / 100).toFixed(2)}</span>
        </div>
        {selectedPackage.bonusCredits && selectedPackage.bonusCredits > 0 && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <Sparkles className="h-3 w-3" />
            <span>+{selectedPackage.bonusCredits} bonus credits included!</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-5 w-5 text-blue-400" />
            <h4 className="font-medium text-white">Cryptocurrency Payment</h4>
          </div>
          <p className="text-sm text-gray-400 mb-3">
            Pay securely with Bitcoin, Ethereum, or other cryptocurrencies. You'll be redirected to NOWPayments to complete your purchase.
          </p>
          
          <div className="p-3 bg-purple-500/10 rounded border border-purple-500/20">
            <p className="text-sm text-gray-400 mb-2">
              <strong className="text-purple-300">Don't have crypto?</strong> Buy cryptocurrency instantly with your credit card using{" "}
              <a 
                href="https://www.moonpay.com/buy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
                data-testid="link-moonpay"
              >
                MoonPay
              </a>
              , then return here to complete your purchase. We apologize for the inconvenience.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            className="flex-1"
            data-testid="button-cancel-payment"
          >
            Cancel
          </Button>
          <Button 
            onClick={handlePayNow}
            disabled={isProcessing}
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold"
            data-testid="button-pay-now"
          >
            {isProcessing ? "Processing..." : `Pay $${(selectedPackage.price / 100).toFixed(2)} with Crypto`}
          </Button>
        </div>
        
        {/* Retry button for blocked popups */}
        {showRetryButton && paymentUrl && (
          <div className="mt-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-4 w-4 text-orange-400" />
              <h4 className="text-sm font-medium text-orange-300">Payment Window Blocked</h4>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Your browser blocked the payment popup. Click the button below to open the payment window.
            </p>
            <Button 
              onClick={handleRetryPayment}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-retry-payment"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Payment Window
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function BuyCredits() {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const { toast } = useToast();

  const { data: packages = [], isLoading } = useQuery<CreditPackage[]>({
    queryKey: ["/api/credit-packages"],
  });

  const { data: user } = useQuery<{ buzzCredits?: number }>({
    queryKey: ["/api/user"],
  });

  const handleSelectPackage = (pkg: CreditPackage) => {
    setSelectedPackage(pkg);
  };
  
  // Check for packageId in URL params and auto-select package
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const packageIdFromUrl = urlParams.get('packageId');
    
    if (packageIdFromUrl && packages.length > 0 && !selectedPackage) {
      const packageToSelect = packages.find(pkg => pkg.id === packageIdFromUrl);
      if (packageToSelect) {
        handleSelectPackage(packageToSelect);
        // Clean up URL
        window.history.replaceState({}, '', '/buy-credits');
      }
    }
  }, [packages, selectedPackage]);

  const handleSuccess = () => {
    setSelectedPackage(null);
    
    // Use React router for navigation instead of full page reload
    // This preserves localStorage data better than window.location.href
    setTimeout(() => {
      window.location.href = "/thank-you";
    }, 100); // Small delay to ensure localStorage is written
  };

  const handleCancel = () => {
    setSelectedPackage(null);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-64 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If package is selected, show the crypto payment form
  if (selectedPackage) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" onClick={handleCancel} data-testid="button-back-to-packages">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Packages
          </Button>
        </div>
        
        <h1 className="text-3xl font-bold mb-8 text-center">Complete Your Purchase</h1>
        
        <CryptoPayment 
          selectedPackage={selectedPackage}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">Buy Buzz Credits</h1>
        <p className="text-xl text-muted-foreground mb-4">
          Power your AI image generations with Buzz credits
        </p>
        {user && (
          <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-lg">
            <Coins className="h-5 w-5 text-yellow-500" />
            <span className="font-medium" data-testid="current-balance">
              Current Balance: {user.buzzCredits || 0} Buzz
            </span>
          </div>
        )}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {packages
          .filter((pkg) => pkg.isActive)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map((pkg) => (
          <Card key={pkg.id} className={`relative transition-transform hover:scale-105 ${pkg.isPopular ? 'ring-2 ring-primary' : ''}`}>
            {pkg.isPopular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-3 py-1">
                  <Star className="h-3 w-3 mr-1" />
                  Most Popular
                </Badge>
              </div>
            )}
            
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg" data-testid={`package-title-${pkg.id}`}>{pkg.name}</CardTitle>
              <CardDescription data-testid={`package-description-${pkg.id}`}>{pkg.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="text-center space-y-4">
              <div className="space-y-2">
                <div className="text-3xl font-bold" data-testid={`package-price-${pkg.id}`}>
                  ${(pkg.price / 100).toFixed(2)}
                </div>
                <div className="text-lg text-muted-foreground">
                  <span className="font-semibold text-foreground" data-testid={`package-base-credits-${pkg.id}`}>
                    {pkg.credits}
                  </span> Buzz Credits
                </div>
                {pkg.bonusCredits && pkg.bonusCredits > 0 && (
                  <div className="flex items-center justify-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <Sparkles className="h-3 w-3" />
                    <span data-testid={`package-bonus-${pkg.id}`}>+{pkg.bonusCredits} bonus credits!</span>
                  </div>
                )}
              </div>
              
              <div className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground" data-testid={`package-total-credits-${pkg.id}`}>
                  {pkg.credits + (pkg.bonusCredits || 0)}
                </span> credits
              </div>
              
              <Button 
                className="w-full" 
                variant={pkg.isPopular ? "default" : "outline"}
                onClick={() => handleSelectPackage(pkg)}
                data-testid={`button-select-${pkg.id}`}
              >
                <Coins className="h-4 w-4 mr-2" />
                Buy with Crypto
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground space-y-3">
        <p>Payments are processed securely through NOWPayments. Pay with Bitcoin, Ethereum, or other cryptocurrencies.</p>
        
        <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20 max-w-2xl mx-auto">
          <p className="text-purple-300 font-medium mb-2">💳 Need to buy cryptocurrency first?</p>
          <p>
            Use{" "}
            <a 
              href="https://www.moonpay.com/buy" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline font-medium"
              data-testid="link-moonpay-main"
            >
              MoonPay
            </a>
            {" "}to purchase Bitcoin, Ethereum, or other cryptocurrencies instantly with your credit card. 
            After purchasing crypto, return here to complete your credit purchase. We apologize for the inconvenience.
          </p>
        </div>
        
        <p className="mt-2">Credits never expire and can be used for all AI image generation features.</p>
      </div>
    </div>
  );
}