/**
 * Global hook that watches for a pending fip-fap image-to-video job and shows
 * a toast notification when it finishes — even if the user has navigated away
 * from the fip-fap page.
 *
 * The fip-fap page itself renders a richer "completed video" popup when the
 * user is already there.  This hook is intentionally disabled on those routes
 * so the two handlers don't double-fire.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import type { Generation } from '@/types';

const PENDING_JOB_KEY = 'fipfap_pendingVideoJob';

// Custom event dispatched by Transform (same tab) when it writes the pending key.
// Native `storage` events only fire in *other* tabs, so we bridge the gap here.
const JOB_REGISTERED_EVENT = 'fipfap:video-job-registered';

// Routes where fip-fap already handles its own completion popup — skip toast there.
const FIPFAP_ROUTES = new Set(['/', '/fip-fap']);

export function usePendingVideoNotification() {
  const { toast } = useToast();
  const [location] = useLocation();

  // Initialise from localStorage so we start polling immediately if a job was
  // already in progress when the component mounts (e.g. page refresh).
  const [pendingJobId, setPendingJobId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PENDING_JOB_KEY);
    } catch {
      return null;
    }
  });

  // Listen for the custom event dispatched by Transform in the SAME tab when it
  // writes the pending key.  Same-tab localStorage.setItem does not fire a
  // `storage` event, so this custom event bridges that gap.
  useEffect(() => {
    const onJobRegistered = (e: Event) => {
      const jobId = (e as CustomEvent<{ jobId: string }>).detail?.jobId ?? null;
      if (jobId) setPendingJobId(jobId);
    };
    window.addEventListener(JOB_REGISTERED_EVENT, onJobRegistered);
    return () => window.removeEventListener(JOB_REGISTERED_EVENT, onJobRegistered);
  }, []);

  // Also listen for cross-tab changes (e.g. user has Transform open in another tab).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PENDING_JOB_KEY) {
        setPendingJobId(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Re-check localStorage on route changes so that navigating back to a page
  // that set the key (before this hook was mounted) still picks it up.
  useEffect(() => {
    try {
      const current = localStorage.getItem(PENDING_JOB_KEY);
      setPendingJobId(current);
    } catch {
      // localStorage unavailable — nothing to track
    }
  }, [location]);

  const isFipFapRoute = FIPFAP_ROUTES.has(location);

  // Poll the generation record while a pending job exists and we're not on a
  // fip-fap route (those pages handle their own completion UI).
  const { data: job, error } = useQuery<Generation>({
    queryKey: ['/api/generations', pendingJobId],
    enabled: !!pendingJobId && !isFipFapRoute,
    retry: 2,
    refetchInterval: (q) => {
      if (q.state.status === 'error') return false;
      const g = q.state.data as Generation | undefined;
      return g && (g.status === 'completed' || g.status === 'failed') ? false : 5000;
    },
  });

  // Drop the key if the record can't be fetched (deleted, 404, session expired)
  // so we don't keep polling across sessions.
  useEffect(() => {
    if (error && pendingJobId) {
      try { localStorage.removeItem(PENDING_JOB_KEY); } catch { /* ignore */ }
      setPendingJobId(null);
    }
  }, [error, pendingJobId]);

  // When the job reaches a terminal state, notify the user and clean up.
  useEffect(() => {
    if (!job || !pendingJobId || isFipFapRoute) return;

    if (job.status === 'completed') {
      try { localStorage.removeItem(PENDING_JOB_KEY); } catch { /* ignore */ }
      setPendingJobId(null);

      toast({
        title: '🎬 Your video is ready!',
        description: job.videoUrl
          ? 'Your image-to-video has finished. View it in your Gallery.'
          : 'Your image-to-video has finished generating.',
        duration: 12000,
      });
    } else if (job.status === 'failed') {
      try { localStorage.removeItem(PENDING_JOB_KEY); } catch { /* ignore */ }
      setPendingJobId(null);

      toast({
        title: 'Video generation failed',
        description: 'Your image-to-video job did not complete. Please try again.',
        variant: 'destructive',
      });
    }
  }, [job, pendingJobId, isFipFapRoute, toast]);
}
