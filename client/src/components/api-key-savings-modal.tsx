import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, ExternalLink, Coins, TrendingDown } from 'lucide-react';
import { useLocation } from 'wouter';

interface ApiKeySavingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  generationCount: number;
}

export default function ApiKeySavingsModal({ isOpen, onClose, generationCount }: ApiKeySavingsModalProps) {
  const [, navigate] = useLocation();

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings');
  };

  const creditsWasted = generationCount * 8; // 8 extra credits per image (12 - 4)
  const creditsSavedNext = 8; // Savings on next generation

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-green-500" />
            Save 67% on Image Generation!
          </DialogTitle>
          <DialogDescription>
            Add your CivitAI API key to dramatically reduce generation costs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cost Comparison */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-red-200">
              <CardContent className="p-4 text-center">
                <div className="text-red-600 font-semibold">Current Cost</div>
                <div className="text-2xl font-bold text-red-600">12</div>
                <div className="text-sm text-muted-foreground">credits per image</div>
              </CardContent>
            </Card>
            
            <Card className="border-green-200">
              <CardContent className="p-4 text-center">
                <div className="text-green-600 font-semibold">With Your API</div>
                <div className="text-2xl font-bold text-green-600">4</div>
                <div className="text-sm text-muted-foreground">credits per image</div>
              </CardContent>
            </Card>
          </div>

          {/* Savings Summary */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-4">
            <div className="text-center space-y-2">
              <div className="text-green-700 dark:text-green-300 font-medium">Your Potential Savings</div>
              <div className="text-3xl font-bold text-green-600">{creditsWasted}</div>
              <div className="text-sm text-green-600">credits already overpaid</div>
              <div className="text-xs text-muted-foreground">
                Save {creditsSavedNext} credits on your next generation!
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-500" />
              <span>Save 67% on every image generation</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500" />
              <span>Your credits last 3x longer</span>
            </div>
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-purple-500" />
              <span>Access to premium CivitAI models</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <Button 
              onClick={handleGoToSettings}
              className="w-full"
              data-testid="button-add-api-key"
            >
              Add My CivitAI API Key
            </Button>
            <Button 
              variant="outline" 
              onClick={onClose}
              className="w-full"
              data-testid="button-maybe-later"
            >
              Maybe Later
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-xs text-muted-foreground text-center">
            Get your free API key at{' '}
            <a 
              href="https://civitai.com/user/account" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              civitai.com/user/account
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}