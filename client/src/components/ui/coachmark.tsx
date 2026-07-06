import { useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { X, ArrowDown } from 'lucide-react';

interface CoachmarkProps {
  children: ReactNode;
  title: string;
  description: string;
  ctaText: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCTAClick: () => void;
  onDismiss: () => void;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  showArrow?: boolean;
  useAnchor?: boolean;
}

export function Coachmark({
  children,
  title,
  description,
  ctaText,
  isOpen,
  onOpenChange,
  onCTAClick,
  onDismiss,
  placement = 'bottom',
  showArrow = true,
  useAnchor = false,
}: CoachmarkProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Delay animation start to ensure smooth appearance
      const timer = setTimeout(() => setAnimate(true), 100);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  const handleCTAClick = () => {
    onCTAClick();
    onOpenChange(false);
  };

  const handleDismiss = () => {
    onDismiss();
    onOpenChange(false);
  };

  if (useAnchor) {
    // For anchor mode, render the children without triggering functionality
    return (
      <div className="relative">
        {children}
        <Popover open={isOpen} onOpenChange={onOpenChange}>
          {/* Hidden trigger that won't interfere */}
          <PopoverTrigger asChild>
            <div className="absolute inset-0 pointer-events-none opacity-0" />
          </PopoverTrigger>
          <PopoverContent
        side={placement}
        align="center"
        className={cn(
          "w-72 p-4 bg-gradient-to-br from-purple-600/95 to-pink-600/95 text-white border-purple-400/50 shadow-xl backdrop-blur-sm",
          "transform transition-all duration-500 ease-out",
          isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-2"
        )}
        sideOffset={12}
        data-testid="coachmark-content"
        aria-labelledby="coachmark-title"
        aria-describedby="coachmark-description"
      >
        {/* Arrow indicator */}
        {showArrow && (
          <div className={cn(
            "absolute flex items-center justify-center",
            "animate-bounce text-yellow-300",
            animate ? "opacity-100" : "opacity-0",
            "transition-opacity duration-1000 delay-500"
          )}>
            <ArrowDown 
              className={cn(
                "h-5 w-5 animate-pulse",
                placement === 'bottom' && "-top-8 left-1/2 transform -translate-x-1/2 rotate-180",
                placement === 'top' && "-bottom-8 left-1/2 transform -translate-x-1/2",
                placement === 'left' && "-right-8 top-1/2 transform -translate-y-1/2 rotate-90",
                placement === 'right' && "-left-8 top-1/2 transform -translate-y-1/2 -rotate-90"
              )} 
            />
          </div>
        )}

        {/* Close button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          className="absolute top-2 right-2 h-6 w-6 p-0 text-white/80 hover:text-white hover:bg-white/10"
          data-testid="button-coachmark-dismiss"
        >
          <X className="h-3 w-3" />
        </Button>

        {/* Content */}
        <div className="space-y-3">
          <h3 
            id="coachmark-title" 
            className="font-semibold text-lg text-yellow-300"
          >
            {title}
          </h3>
          <p 
            id="coachmark-description" 
            className="text-sm text-white/90 leading-relaxed"
          >
            {description}
          </p>
          
          {/* CTA Button */}
          <div className="flex justify-center pt-2">
            <Button
              onClick={handleCTAClick}
              className={cn(
                "bg-yellow-400 hover:bg-yellow-300 text-black font-medium text-sm px-4 py-2",
                "transform transition-all duration-200 hover:scale-105",
                "shadow-lg hover:shadow-xl",
                animate ? "animate-pulse" : ""
              )}
              data-testid="button-coachmark-cta"
            >
              {ctaText} ✨
            </Button>
          </div>
        </div>

          {/* Subtle glow effect */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-purple-400/10 to-pink-400/10 pointer-events-none" />
        </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Normal trigger mode for standard usage
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={placement}
        align="center"
        className={cn(
          "w-72 p-4 bg-gradient-to-br from-purple-600/95 to-pink-600/95 text-white border-purple-400/50 shadow-xl backdrop-blur-sm",
          "transform transition-all duration-500 ease-out",
          isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-2"
        )}
        sideOffset={12}
        data-testid="coachmark-content"
        aria-labelledby="coachmark-title"
        aria-describedby="coachmark-description"
      >
        {/* Arrow indicator */}
        {showArrow && (
          <div className={cn(
            "absolute flex items-center justify-center",
            "animate-bounce text-yellow-300",
            animate ? "opacity-100" : "opacity-0",
            "transition-opacity duration-1000 delay-500"
          )}>
            <ArrowDown 
              className={cn(
                "h-5 w-5 animate-pulse",
                placement === 'bottom' && "-top-8 left-1/2 transform -translate-x-1/2 rotate-180",
                placement === 'top' && "-bottom-8 left-1/2 transform -translate-x-1/2",
                placement === 'left' && "-right-8 top-1/2 transform -translate-y-1/2 rotate-90",
                placement === 'right' && "-left-8 top-1/2 transform -translate-y-1/2 -rotate-90"
              )} 
            />
          </div>
        )}

        {/* Close button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          className="absolute top-2 right-2 h-6 w-6 p-0 text-white/80 hover:text-white hover:bg-white/10"
          data-testid="button-coachmark-dismiss"
        >
          <X className="h-3 w-3" />
        </Button>

        {/* Content */}
        <div className="space-y-3">
          <h3 
            id="coachmark-title" 
            className="font-semibold text-lg text-yellow-300"
          >
            {title}
          </h3>
          <p 
            id="coachmark-description" 
            className="text-sm text-white/90 leading-relaxed"
          >
            {description}
          </p>
          
          {/* CTA Button */}
          <div className="flex justify-center pt-2">
            <Button
              onClick={handleCTAClick}
              className={cn(
                "bg-yellow-400 hover:bg-yellow-300 text-black font-medium text-sm px-4 py-2",
                "transform transition-all duration-200 hover:scale-105",
                "shadow-lg hover:shadow-xl",
                animate ? "animate-pulse" : ""
              )}
              data-testid="button-coachmark-cta"
            >
              {ctaText} ✨
            </Button>
          </div>
        </div>

        {/* Subtle glow effect */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-purple-400/10 to-pink-400/10 pointer-events-none" />
      </PopoverContent>
    </Popover>
  );
}