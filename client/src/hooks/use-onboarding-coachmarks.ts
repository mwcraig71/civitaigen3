import { useState, useEffect, useCallback } from 'react';

export interface CoachmarkState {
  shown: boolean;
  dismissed: boolean;
  converted: boolean;
  timestamp?: number;
}

interface UseOnboardingCoachmarksOptions {
  storageKey: string;
  version?: string;
  triggerDelay?: number;
  enabledCondition?: () => boolean;
}

export function useOnboardingCoachmarks({
  storageKey,
  version = 'v1',
  triggerDelay = 1000,
  enabledCondition = () => true,
}: UseOnboardingCoachmarksOptions) {
  const fullStorageKey = `coachmark.${storageKey}.${version}`;
  
  const [state, setState] = useState<CoachmarkState>(() => {
    try {
      const stored = localStorage.getItem(fullStorageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to parse coachmark state from localStorage:', error);
    }
    return { shown: false, dismissed: false, converted: false };
  });

  const [isOpen, setIsOpen] = useState(false);
  const [triggerTimer, setTriggerTimer] = useState<NodeJS.Timeout | null>(null);

  // Save state to localStorage
  const saveState = useCallback((newState: CoachmarkState) => {
    try {
      localStorage.setItem(fullStorageKey, JSON.stringify(newState));
      setState(newState);
    } catch (error) {
      console.warn('Failed to save coachmark state to localStorage:', error);
    }
  }, [fullStorageKey]);

  // Check if coachmark should be shown
  const shouldShow = useCallback(() => {
    if (!enabledCondition()) return false;
    if (state.shown || state.dismissed || state.converted) return false;
    
    // Check for reduced motion preference
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    
    return true;
  }, [state, enabledCondition]);

  // Trigger coachmark display
  const trigger = useCallback(() => {
    if (!shouldShow()) return;

    // Clear any existing timer
    if (triggerTimer) {
      clearTimeout(triggerTimer);
    }

    const timer = setTimeout(() => {
      setIsOpen(true);
      saveState({ 
        ...state, 
        shown: true, 
        timestamp: Date.now() 
      });
      
      // Track impression
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'coachmark_impression', {
          coachmark_id: storageKey,
          version: version
        });
      }
    }, triggerDelay);

    setTriggerTimer(timer);
  }, [shouldShow, triggerTimer, triggerDelay, saveState, state, storageKey, version]);

  // Handle CTA click (conversion)
  const handleCTAClick = useCallback(() => {
    saveState({ 
      ...state, 
      converted: true, 
      timestamp: Date.now() 
    });
    
    // Track conversion
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'coachmark_conversion', {
        coachmark_id: storageKey,
        version: version
      });
    }
  }, [state, saveState, storageKey, version]);

  // Handle dismissal
  const handleDismiss = useCallback(() => {
    saveState({ 
      ...state, 
      dismissed: true, 
      timestamp: Date.now() 
    });
    
    // Track dismissal
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'coachmark_dismiss', {
        coachmark_id: storageKey,
        version: version
      });
    }
  }, [state, saveState, storageKey, version]);

  // Handle open state changes
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open && state.shown && !state.dismissed && !state.converted) {
      // User closed without interaction - count as dismissal
      handleDismiss();
    }
  }, [state, handleDismiss]);

  // Reset coachmark (useful for development/testing)
  const reset = useCallback(() => {
    localStorage.removeItem(fullStorageKey);
    setState({ shown: false, dismissed: false, converted: false });
    setIsOpen(false);
  }, [fullStorageKey]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (triggerTimer) {
        clearTimeout(triggerTimer);
      }
    };
  }, [triggerTimer]);

  return {
    isOpen,
    shouldShow: shouldShow(),
    trigger,
    handleCTAClick,
    handleDismiss,
    handleOpenChange,
    reset, // For development
    state
  };
}