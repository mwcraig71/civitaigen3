import { useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';

// Send tracking event to server
async function sendTrackingEvent(page: string, action: string, details?: any) {
  try {
    await fetch('/api/tracking/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ page, action, details }),
    });
  } catch (error) {
    // Silently fail - tracking shouldn't break the app
    console.debug('Tracking event failed:', error);
  }
}

// Hook to track page navigation
export function usePageTracking() {
  const [location] = useLocation();
  
  useEffect(() => {
    sendTrackingEvent(location, 'page_view');
  }, [location]);
}

// Function to track user actions
export function trackAction(action: string, details?: any) {
  const page = window.location.pathname;
  sendTrackingEvent(page, action, details);
}

// Helper to track button clicks
export function trackButtonClick(buttonName: string, details?: any) {
  trackAction('button_click', { button: buttonName, ...details });
}

// Helper to track form submissions
export function trackFormSubmit(formName: string, details?: any) {
  trackAction('form_submit', { form: formName, ...details });
}

// Helper to track image generations
export function trackGeneration(modelName: string, details?: any) {
  trackAction('image_generation', { model: modelName, ...details });
}

// Helper to track navigation
export function trackNavigation(destination: string) {
  trackAction('navigation', { destination });
}
