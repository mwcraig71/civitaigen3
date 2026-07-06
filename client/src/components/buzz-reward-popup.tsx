import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Sparkles, Coins } from 'lucide-react';

interface BuzzRewardPopupProps {
  isOpen: boolean;
  onClose: () => void;
  buzzAmount: number;
  reason: 'share' | 'like' | 'generation';
  details?: string;
}

export function BuzzRewardPopup({ isOpen, onClose, buzzAmount, reason, details }: BuzzRewardPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-close after 5 seconds
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for animation to complete
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  const getReasonText = () => {
    switch (reason) {
      case 'share':
        return 'Shared to Community!';
      case 'like':
        return 'Image Liked!';
      case 'generation':
        return 'Generation Complete!';
      default:
        return 'Buzz Earned!';
    }
  };

  const getReasonIcon = () => {
    switch (reason) {
      case 'share':
        return '🌟';
      case 'like':
        return '❤️';
      case 'generation':
        return '🎨';
      default:
        return '💫';
    }
  };

  const getDescription = () => {
    switch (reason) {
      case 'share':
        return `You earned ${buzzAmount} buzz for sharing your creation with the community!`;
      case 'like':
        return `You earned ${buzzAmount} buzz because someone liked your shared image!`;
      case 'generation':
        return `You earned ${buzzAmount} buzz for completing an image generation!`;
      default:
        return `You earned ${buzzAmount} buzz!`;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={`${isMobile 
          ? 'max-w-[85vw] mx-auto' 
          : 'fixed top-4 right-4 max-w-sm'
        } bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950 border-2 border-yellow-200 dark:border-yellow-800 shadow-lg transition-all duration-300 ${
          isVisible ? 'animate-in slide-in-from-right-5' : 'animate-out slide-out-to-right-5'
        }`}
        style={isMobile ? {
          transform: 'translate(-50%, -50%)',
          position: 'fixed',
          top: '50%',
          left: '50%',
          margin: 0,
        } : {
          transform: 'none',
          position: 'fixed',
          margin: 0,
        }}
        data-testid="buzz-reward-popup"
      >
        <div className="relative p-4">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-1 right-1 h-6 w-6 rounded-full p-0 hover:bg-yellow-100 dark:hover:bg-yellow-900"
            data-testid="button-close-buzz-popup"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{getReasonIcon()}</span>
            <h3 className="font-bold text-lg text-yellow-800 dark:text-yellow-200">
              {getReasonText()}
            </h3>
          </div>

          {/* Buzz Amount Display */}
          <div className="flex items-center justify-center gap-2 mb-3 p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
            <Coins className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              +{buzzAmount}
            </span>
            <Sparkles className="h-5 w-5 text-yellow-500 animate-pulse" />
          </div>

          {/* Description */}
          <p className="text-sm text-center text-yellow-700 dark:text-yellow-300 mb-2">
            {getDescription()}
          </p>

          {/* Additional Details */}
          {details && (
            <p className="text-xs text-center text-yellow-600 dark:text-yellow-400 opacity-75">
              {details}
            </p>
          )}

          {/* Progress Bar Animation */}
          <div className="mt-3 h-1 bg-yellow-200 dark:bg-yellow-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-5000 ease-linear"
              style={{
                width: isVisible ? '0%' : '100%',
                transition: 'width 5s linear'
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}