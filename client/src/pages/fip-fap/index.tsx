import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, Search, ArrowLeft, X, Download, EyeOff, Eye, Share, Plus, Sparkles, Trash2, AlertTriangle, User, Edit3, ArrowUpDown, FileText, UserX, ChevronsLeft, ChevronsRight, BookOpen } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SharedImage } from '@/types';
import { GenerationRewardPopup } from '@/components/generation-reward-popup';
import { BuzzRewardPopup } from '@/components/buzz-reward-popup';
import { UserPreferences } from '@/components/preferences-modal';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingCoachmarks } from '@/hooks/use-onboarding-coachmarks';
import { Coachmark } from '@/components/ui/coachmark';
import { resilientStorage } from '@/lib/resilient-storage';
import type { Generation } from '@/types';
import { StoryPanel } from '@/components/StoryPanel';
import { MobileStorySheet } from '@/components/MobileStorySheet';

import { FipFapSlide } from './fip-fap-slide';
import type { PaginatedSharedImagesResponse, SearchResult } from './types';

export default function FipFap() {
  const [allImages, setAllImages] = useState<SharedImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  // Search filter state - NEW: replaces old filter system
  const [searchFilter, setSearchFilter] = useState<{type: 'character' | 'prompt' | 'rating' | null, value: string | null}>({
    type: null,
    value: null
  });
  
  // Sort order state
  const [sortOrder, setSortOrder] = useState<'trending' | 'newest' | 'oldest'>('trending');

  // Get current user for ownership checks
  const { data: currentUser } = useQuery<import('@/types').AuthUser | null>({
    queryKey: ['/api/auth/user'],
  });

  // Get available characters for editing
  const { data: availableCharacters = [] } = useQuery<{ id: string; name: string; description?: string | null }[]>({
    queryKey: ['/api/characters'],
  });

  // Mutation for updating character names, scene descriptions, and ratings
  const updateCharacterMutation = useMutation({
    mutationFn: ({ imageId, characterName, sceneName, rating }: { imageId: string, characterName: string | null, sceneName: string | null, rating: string }) => 
      apiRequest('PATCH', `/api/shared-images/${imageId}`, { characterName, sceneName, rating }),
    onSuccess: (_, variables) => {
      // CRITICAL FIX: Update local state immediately (allImages is useState, not React Query)
      setAllImages(prevImages => 
        prevImages.map(img => 
          img.id === variables.imageId 
            ? { ...img, characterName: variables.characterName, sceneName: variables.sceneName, rating: variables.rating as typeof img.rating }
            : img
        )
      );
      
      // Invalidate all relevant queries to refresh the UI immediately
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images/characters'] });
      queryClient.invalidateQueries({ queryKey: ['/api/generations'] });
    },
    onError: (error) => {
      console.error('Failed to update image:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update the image. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handler for editing character names, scene descriptions, and ratings
  const handleEditCharacter = (imageId: string, characterName: string, sceneName: string, rating: string) => {
    const finalCharacterName = characterName === 'none' ? null : characterName;
    const finalSceneName = sceneName.trim() || null;
    updateCharacterMutation.mutate({ imageId, characterName: finalCharacterName, sceneName: finalSceneName, rating });
  };

  // Quick rating handler for admin one-click rating
  const handleQuickRating = (rating: 'PG' | 'R' | 'X') => {
    const currentImage = allImages[activeIndex];
    if (!currentImage) return;
    
    // Keep existing character name and scene name, just update rating
    const characterName = currentImage.characterName || null;
    const sceneName = currentImage.sceneName || null;
    
    updateCharacterMutation.mutate(
      { 
        imageId: currentImage.id, 
        characterName, 
        sceneName, 
        rating 
      },
      {
        onSuccess: () => {
          toast({
            title: "Rating Updated",
            description: `Image rated as ${rating}`,
          });
        }
      }
    );
  };
  // Helper functions for persistent random starting points
  // Uses resilientStorage to handle Safari private mode gracefully
  const getStoredOffsetData = () => {
    try {
      const nextOffsetData = resilientStorage.getItem('fipfap:nextStartOffset');
      const lastStartsData = resilientStorage.getItem('fipfap:lastStarts');
      const sessionUsed = resilientStorage.getSessionItem('fipfap:sessionOffsetUsed');
      
      return {
        nextStartOffset: nextOffsetData ? parseInt(nextOffsetData) : null,
        lastStarts: lastStartsData ? JSON.parse(lastStartsData) : [],
        sessionUsed: sessionUsed === 'true'
      };
    } catch {
      return { nextStartOffset: null, lastStarts: [], sessionUsed: false };
    }
  };

  const storeNextRandomOffset = (currentOffset: number, totalImages: number, limit: number = 20, cause: string = 'unknown') => {
    // Suppress during WebSocket reconnections
    if (isWebSocketReconnecting.current) {
      console.log(`🚫 Suppressing random offset generation due to WebSocket reconnection (cause: ${cause})`);
      return;
    }
    
    try {
      const { lastStarts } = getStoredOffsetData();
      
      // Enhanced randomization system for better distribution
      const maxOffset = Math.max(0, totalImages - limit);
      
      // Increase history size to avoid more recent entries (15 instead of 5)
      const HISTORY_SIZE = 15;
      const ZONE_COUNT = 10; // Divide total range into zones for better distribution
      
      // Add time-based entropy for better randomness
      const now = Date.now();
      const timeSeed = (now % 10000) / 10000; // Use last 4 digits as seed
      
      // Calculate zone-based distribution to prevent clustering
      const zoneSize = Math.max(1, Math.floor(maxOffset / ZONE_COUNT));
      const zones = Array.from({ length: ZONE_COUNT }, (_, i) => i);
      
      // Filter out zones that contain recent starting points
      const recentZones = new Set(
        lastStarts
          .slice(0, HISTORY_SIZE)
          .map((offset: number) => Math.floor(offset / zoneSize))
          .filter((zone: number) => zone >= 0 && zone < ZONE_COUNT)
      );
      
      // Remove current zone as well
      const currentZone = Math.floor(currentOffset / zoneSize);
      recentZones.add(currentZone);
      
      // Get available zones (zones not recently used)
      const availableZones = zones.filter(zone => !recentZones.has(zone));
      
      let newOffset!: number;
      let selectedZone!: number;
      
      if (availableZones.length > 0) {
        // Pick a random available zone
        const randomZoneIndex = Math.floor((Math.random() + timeSeed) * availableZones.length) % availableZones.length;
        selectedZone = availableZones[randomZoneIndex];
        
        // Generate random offset within the selected zone
        const zoneStart = selectedZone * zoneSize;
        const zoneEnd = Math.min(maxOffset, (selectedZone + 1) * zoneSize - 1);
        const zoneRange = zoneEnd - zoneStart + 1;
        
        // Use enhanced randomization with time-based seed
        const random1 = Math.random();
        const random2 = Math.random();
        const random3 = (now * 0.001) % 1; // Additional time-based randomness
        
        // Combine multiple random sources for better distribution
        const combinedRandom = (random1 + random2 + random3) / 3;
        newOffset = zoneStart + Math.floor(combinedRandom * zoneRange);
        
        console.log(`🎯 Using zone-based randomization: Zone ${selectedZone}/${ZONE_COUNT-1} (offset ${newOffset})`);
      } else {
        // Fallback: all zones recently used, use enhanced random with minimum distance
        console.log(`⚠️ All zones recently used, using enhanced fallback randomization`);
        
        let attempts = 0;
        const MIN_DISTANCE = Math.max(limit * 2, Math.floor(maxOffset / 20)); // Minimum distance from recent offsets
        
        do {
          // Use multiple random sources for better distribution
          const random1 = Math.random();
          const random2 = Math.random();
          const timeRandom = ((now + attempts * 1000) * 0.001) % 1;
          
          const combinedRandom = (random1 + random2 + timeRandom) / 3;
          newOffset = Math.floor(combinedRandom * (maxOffset + 1));
          
          // Check if this offset is far enough from recent ones
          const tooClose = lastStarts.slice(0, Math.min(HISTORY_SIZE, lastStarts.length)).some(
            (recentOffset: number) => Math.abs(newOffset - recentOffset) < MIN_DISTANCE
          );
          
          attempts++;
          
          if (!tooClose || attempts >= 50) break; // Increased attempts for better results
          
        } while (attempts < 50);
        
        console.log(`🎲 Enhanced fallback: offset ${newOffset} after ${attempts} attempts`);
      }
      
      // Ensure offset is within valid bounds
      newOffset = Math.max(0, Math.min(newOffset, maxOffset));
      
      // Update last starts history (keep more history for better avoidance)
      const updatedStarts = [currentOffset, ...lastStarts.slice(0, HISTORY_SIZE - 1)];
      
      resilientStorage.setItem('fipfap:nextStartOffset', newOffset.toString());
      resilientStorage.setItem('fipfap:lastStarts', JSON.stringify(updatedStarts));
      
      console.log(`💾 Enhanced random offset: ${newOffset} (avoiding ${updatedStarts.length} recent starts, selected zone: ${selectedZone ?? 'fallback'}, cause: ${cause})`);
      return newOffset;
    } catch (error) {
      console.error('Failed to store next offset:', error);
      // Enhanced fallback with time-based randomness
      const timeSeed = Date.now() * 0.001 % 1;
      return Math.floor((Math.random() + timeSeed) * 1000) % 1000;
    }
  };

  const [offset, setOffset] = useState(0); // Start with 0, let server handle random start
  // Track the actual global offset from API (for random-start mode where offset state stays 0)
  const actualGlobalOffsetRef = useRef(0);
  const [sourceFilter, setSourceFilter] = useState<string>('community');
  const [excludeOwnImages, setExcludeOwnImages] = useState(false);
  const [characterFilter, setCharacterFilter] = useState<string>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTab, setSearchTab] = useState<'all' | 'characters' | 'prompts' | 'ratings' | 'my-feed'>('all');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [likedImages, setLikedImages] = useState<Set<string>>(new Set());
  const [showUI, setShowUI] = useState(true);
  const [showStoryPanel, setShowStoryPanel] = useState(false);
  const [sequentialMode, setSequentialMode] = useState(() => {
    const stored = resilientStorage.getItem('fipfap:sequentialMode');
    // Default to sequential mode (true) for stability - random mode can cause issues in private browsing
    return stored === null ? true : stored === 'true';
  });

  // Onboarding tooltip for Enhance button
  const enhanceCoachmark = useOnboardingCoachmarks({
    storageKey: 'enhance',
    version: 'v1',
    triggerDelay: 2000, // Show after 2 seconds
    enabledCondition: () => allImages.length > 0, // Only show when images are loaded
  });

  // Trigger tooltip when images are loaded and user is browsing
  useEffect(() => {
    if (allImages.length > 0 && enhanceCoachmark.shouldShow) {
      // Trigger after user has had time to see some images
      enhanceCoachmark.trigger();
    }
  }, [allImages.length, enhanceCoachmark]);
  
  const [showModifiersSheet, setShowModifiersSheet] = useState(false);
  const [selectedImageForGeneration, setSelectedImageForGeneration] = useState<SharedImage | null>(null);
  
  // Enhancement modal state
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [imageForEnhancement, setImageForEnhancement] = useState<SharedImage | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showEditQuickPicks, setShowEditQuickPicks] = useState(false);
  
  // Default quick picks
  const DEFAULT_QUICK_PICKS = [
    '(happy)', '(sad)', '(smirking)', '(scared)', '(embarresed)', '(eyes closed)',
    '(mouth open)', '(pink_panties)', '(cameltoe)', '(1boy), (large_veiny_penis)',
    '(gapping_pussy)', '(gapping_asshole)', '(1boy), (large veiny penis), (fucking pussy)', '(niple_pearsings)',
    '(panties_pulled_to_the_side)', '(masterbating)', '(pre cum)', '(cum)'
  ];
  
  // Quick picks - persisted with resilient storage
  const [quickPicks, setQuickPicks] = useState<string[]>(() => {
    const saved = resilientStorage.getItem('fipfap:quickPicks');
    return saved ? JSON.parse(saved) : DEFAULT_QUICK_PICKS;
  });
  
  // Breast and ass size controls (1-5 scale) - persisted with resilient storage
  const [breastSize, setBreastSize] = useState<number>(() => {
    const saved = resilientStorage.getItem('fipfap:breastSize');
    return saved ? parseInt(saved) : 2; // Default to medium
  });
  const [assSize, setAssSize] = useState<number>(() => {
    const saved = resilientStorage.getItem('fipfap:assSize');
    return saved ? parseInt(saved) : 2; // Default to medium
  });
  
  // Age control (19-65 years) - persisted with resilient storage
  const [age, setAge] = useState<number>(() => {
    const saved = resilientStorage.getItem('fipfap:age');
    return saved ? parseInt(saved) : 25; // Default to 25
  });
  
  // Save quick picks to storage when changed
  useEffect(() => {
    resilientStorage.setItem('fipfap:quickPicks', JSON.stringify(quickPicks));
  }, [quickPicks]);
  
  // Save breast/ass size to storage when changed
  useEffect(() => {
    resilientStorage.setItem('fipfap:breastSize', breastSize.toString());
  }, [breastSize]);
  
  useEffect(() => {
    resilientStorage.setItem('fipfap:assSize', assSize.toString());
  }, [assSize]);
  
  // Save age to storage when changed
  useEffect(() => {
    resilientStorage.setItem('fipfap:age', age.toString());
  }, [age]);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [dismissedProgressBars, setDismissedProgressBars] = useState<Set<string>>(new Set());
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  
  // Buzz reward popup state
  const [showBuzzReward, setShowBuzzReward] = useState(false);
  const [buzzReward, setBuzzReward] = useState<{
    amount: number;
    reason: 'share' | 'like' | 'generation';
    details?: string;
  } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingMoreRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize shared generation settings hook for Fip Fap
  const { form, getGenerationData } = useGenerationSettings({ 
    storagePrefix: 'fipFap' 
  });
  
  // Get user data for WebSocket connection
  const { user } = useAuth();
  
  // WebSocket connection for real-time progress tracking (only when user exists)
  const { messageQueue, setMessageQueue, isConnected } = useWebSocket(user?.id || null);
  
  // Compute progress based on time and completion ratio
  // Linear progress from 10% to 89% over 40 seconds
  const computeProgress = (startTime: number, completedImages: number, totalImages: number): number => {
    const now = Date.now();
    const timeElapsedMs = now - startTime;
    const timeElapsedSec = timeElapsedMs / 1000;
    
    // CRITICAL FIX: If first image is received, jump to 90% and then linearly to 100%
    if (completedImages > 0) {
      const isAllComplete = completedImages >= totalImages;
      if (isAllComplete) return 100;
      
      // We have at least one image, but not all. Jump to 90% and crawl towards 100%
      // Using a 20 second crawl for the remaining 10% to reach 100% quickly but smoothly
      const crawlDuration = 20; 
      const crawlRatio = Math.min(timeElapsedSec / crawlDuration, 1);
      return 90 + (10 * crawlRatio);
    }
    
    // Linear progress from 10% to 89% over 40 seconds before first image
    const timeRatio = Math.min(timeElapsedSec / 40, 1); // 40 seconds to reach 89%
    return 10 + (79 * timeRatio);
  };
  
  // Multi-signal batch progress hook for reliable completion detection
  const useBatchProgress = (batchId: string, totalImages: number, startTime: number) => {
    const [progress, setProgress] = useState(10);
    const [isComplete, setIsComplete] = useState(false);
    const [completedImages, setCompletedImages] = useState(0);
    
    // WebSocket completion detection - immediate 100% when batch completes
    // Note: This hook is currently unused but kept for potential future use
    useEffect(() => {
      // Process message queue for completion messages
      messageQueue.forEach(message => {
        if (message && (message.type === 'generation_complete' || message.type === 'generation_batch_complete')) {
          const messageGenerationId = (message as any).generationId;
          
          if (messageGenerationId === batchId && !isComplete) {
            console.log(`🎯 FipFap WebSocket completion detected! Setting progress to 100% for: ${batchId}`);
            setProgress(100);
            setIsComplete(true);
            setCompletedImages(totalImages);
          }
        }
      });
    }, [messageQueue, batchId, totalImages, isComplete]);
    
    // Status polling backup - check actual stored files
    const { data: statusData } = useQuery({
      queryKey: ['batchStatus', batchId],
      queryFn: async (): Promise<{ completed?: number; isComplete?: boolean }> => {
        const response = await apiRequest('GET', `/api/generations/${batchId}/status`);
        return response.json();
      },
      refetchInterval: (query) => {
        // Poll every 1-3 seconds until complete, then stop
        if (query.state.data?.isComplete) return false;
        return progress < 50 ? 1000 : progress < 80 ? 2000 : 3000;
      },
      enabled: !!batchId && !isComplete,
    });

    // Image availability backup - check if images are actually ready
    const { data: generationData } = useQuery({
      queryKey: ['generationImages', batchId],
      queryFn: async (): Promise<{ images?: unknown[] }> => {
        const response = await apiRequest('GET', `/api/generations/${batchId}`);
        return response.json();
      },
      refetchInterval: (query) => {
        // Stop polling when images are available or complete
        if ((query.state.data?.images?.length ?? 0) >= totalImages || isComplete) return false;
        return 2000; // Check every 2 seconds for actual images
      },
      enabled: !!batchId && !isComplete, // Always check for image availability
    });

    // Multi-signal completion detection
    useEffect(() => {
      if (statusData) {
        console.log(`📊 Status poll result for ${batchId}:`, statusData);
        
        const serverCompletedImages = statusData.completed || 0;
        const serverIsComplete = statusData.isComplete || false;
        
        setCompletedImages(serverCompletedImages);
        
        // Server says it's complete - jump to 100%!
        if (serverIsComplete && !isComplete) {
          console.log(`✅ Status polling detected completion: ${batchId} (${serverCompletedImages}/${totalImages})`);
          console.log(`📊 Completion source: poll_complete for ${batchId}`);
          setProgress(100);
          setIsComplete(true);
          return;
        }
        
        // Update progress if not yet complete
        if (!isComplete && !serverIsComplete) {
          const timeBasedProgress = computeProgress(startTime, serverCompletedImages, totalImages);
          setProgress(timeBasedProgress);
        }
      }
    }, [statusData, batchId, totalImages, startTime, isComplete]);

    // Image availability completion detection - immediate 100% when images are ready
    useEffect(() => {
      if (generationData && !isComplete) {
        const availableImages = generationData.images?.length || 0;
        console.log(`🖼️ Image availability check for ${batchId}: ${availableImages}/${totalImages} images ready`);
        
        if (availableImages >= totalImages) {
          console.log(`🎯 Images are ready! Forcing completion: ${batchId} (${availableImages} images available)`);
          console.log(`📊 Completion source: image_availability for ${batchId}`);
          setProgress(100);
          setIsComplete(true);
          setCompletedImages(availableImages);
        }
      }
    }, [generationData, batchId, totalImages, isComplete]);

    // Direct asset verification as final fallback
    useEffect(() => {
      if (isComplete) return;
      
      // If we're close to time limit but not complete, check images directly
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed > 5 * 60 * 1000) { // After 5 minutes
        const checkImageAssets = async () => {
          try {
            let accessibleImages = 0;
            const checkPromises = [];
            
            // Check if main generation image is accessible
            checkPromises.push(
              fetch(`/api/images/${batchId}`, { method: 'HEAD' })
                .then(res => res.ok ? 1 : 0)
                .catch(() => 0)
            );
            
            const results = await Promise.all(checkPromises);
            accessibleImages = results.reduce((sum, result) => sum + result, 0);
            
            if (accessibleImages >= totalImages && !isComplete) {
              console.log(`🎯 Direct asset check detected completion: ${batchId} (${accessibleImages} images accessible)`);
              setProgress(100);
              setIsComplete(true);
              setCompletedImages(accessibleImages);
            }
          } catch (error) {
            console.log(`⚠️ Asset check failed for ${batchId}:`, error);
          }
        };
        
        const assetCheckInterval = setInterval(checkImageAssets, 15000); // Check every 15 seconds (reduced frequency)
        return () => clearInterval(assetCheckInterval);
      }
    }, [batchId, totalImages, startTime, isComplete]);

    return { progress, isComplete, completedImages };
  };

  // Background generation progress tracking
  const [backgroundGenerations, setBackgroundGenerations] = useState<Map<string, { 
    generation: Generation; 
    progress: number; 
    isCompleted: boolean;
    startTime: number;
    totalImages: number;
    completedImages: number;
    intervalId?: NodeJS.Timeout;
    useBatchProgress?: ReturnType<typeof useBatchProgress>;
  }>>(new Map());
  
  // Placeholder cards for individual images in batches (similar to GenerationPanel)
  const [imagePlaceholders, setImagePlaceholders] = useState<Map<string, {
    batchId: string;
    totalCount: number;
    readyCount: number;
    startTime: number;
  }>>(new Map());
  
  // Track newly inserted images for 'New' badge display
  const [newlyInsertedImages, setNewlyInsertedImages] = useState<Set<string>>(new Set());

  // Reward popup state for completed generations - support multiple simultaneous popups
  const [activePopups, setActivePopups] = useState<Map<string, { generation: Generation; generationId: string; imageUrl: string }>>(new Map());

  // Track completed generations to prevent duplicate completions (using ref for synchronous access)
  const completedGenerationIdsRef = useRef<Set<string>>(new Set());

  // Initialize user preferences with defaults (preferences modal removed from login flow)
  useEffect(() => {
    const loadUserPreferences = () => {
      try {
        const savedPreferences = resilientStorage.getItem('fipfap-user-preferences');
        if (savedPreferences) {
          const preferences = JSON.parse(savedPreferences);
          setUserPreferences(preferences);
          console.log('🎯 Loaded existing user preferences:', preferences);
        } else {
          // First time visitor - use default preferences (Large/Large, no email notifications)
          const defaultPreferences: UserPreferences = {
            breastSize: 3, // Large
            assSize: 3,    // Large
            emailNotifications: false
          };
          resilientStorage.setItem('fipfap-user-preferences', JSON.stringify(defaultPreferences));
          setUserPreferences(defaultPreferences);
          console.log('🎯 First-time visitor - set default preferences:', defaultPreferences);
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
        // If there's an error, use defaults
        const defaultPreferences: UserPreferences = {
          breastSize: 3,
          assSize: 3,
          emailNotifications: false
        };
        setUserPreferences(defaultPreferences);
      }
    };
    
    loadUserPreferences();
  }, []);

  // Queue for completion events that need to be processed
  const [completionQueue, setCompletionQueue] = useState<Array<{ generationId: string; status: 'completed' | 'failed' | 'cancelled'; type?: 'individual' | 'batch'; batchId?: string }>>([]);

  // CRITICAL: Immediate queue-draining effect - processes completion events unconditionally
  useEffect(() => {
    if (completionQueue.length === 0) return;

    const processCompletion = async () => {
      try {
        // Take the first completion event from the queue
        const [firstCompletion, ...remainingQueue] = completionQueue;
        const { generationId, status } = firstCompletion;
        
        console.log(`🎯 Processing completion from queue: ${generationId} (${status})`);
        
        // Update queue first to prevent re-processing
        setCompletionQueue(remainingQueue);
        
        if (status === 'completed') {
          // Extract completion type and process accordingly
          const completionType = firstCompletion.type || 'batch';
          const batchId = firstCompletion.batchId;
          
          // For individual image completions, use a separate tracking system to allow multiple popups
          const trackingKey = completionType === 'individual' ? `individual_${generationId}` : generationId;
          
          // Prevent duplicate processing
          if (completedGenerationIdsRef.current.has(trackingKey)) {
            console.log(`⏭️ Skipping already processed ${completionType} completion: ${generationId}`);
            return;
          }
          
          // Mark as processed immediately
          completedGenerationIdsRef.current.add(trackingKey);
          
          // For individual images, fetch generation data using batchId, for batches use generationId
          const dataId = completionType === 'individual' && batchId ? batchId : generationId;
          
          // Fetch the final generation data from server - apiRequest returns Response, parse JSON
          const genRes = await apiRequest('GET', `/api/generations/${dataId}`);
          const generation = await genRes.json() as Generation;
          if (!generation || !generation.id) {
            console.log(`❌ Failed to fetch completed ${completionType} generation data using ID: ${dataId}`);
            return;
          }
          console.log(`✅ Fetched completed ${completionType} generation data for: ${dataId} (popup for: ${generationId})`);
          
          // ✅ FIXED: FipFap only shows shared community images 
          // Private generations should NOT be auto-injected into FipFap feed
          
          // REWARD POPUP - trigger for ALL completions (individual images and batches)
          // For individual images, use imageId for image URL, for batches use generationId
          const imageUrl = `/api/images/${generationId}`;
          setActivePopups(prev => {
            const newMap = new Map(prev);
            newMap.set(generationId, { generation, generationId, imageUrl });
            return newMap;
          });
          console.log(`🎉 ${completionType} reward popup triggered for image: ${generationId} (generation: ${dataId})`);
          
          // Invalidate queries to keep data fresh - force immediate refetch
          console.log('🔄 Invalidating and refetching gallery queries...');
          await Promise.all([
            queryClient.invalidateQueries({ 
              queryKey: ['/api/shared-images'],
              refetchType: 'active'
            }),
            queryClient.invalidateQueries({ 
              queryKey: ['/api/generations/for-fipfap'],
              refetchType: 'active'
            }),
            queryClient.invalidateQueries({ 
              queryKey: ['/api/favorites/for-fipfap'],
              refetchType: 'active'
            }),
            queryClient.invalidateQueries({ 
              queryKey: ['/api/generations/recent'],
              refetchType: 'active'
            })
          ]);
          console.log('✅ Gallery queries invalidated and refetch triggered');
          
          // Clean up progress tracking (for batch completions only, individual images use batchId)
          if (completionType === 'batch') {
            setBackgroundGenerations(prev => {
              const updated = new Map(prev);
              updated.delete(generationId);
              return updated;
            });
          }
          
        } else if (status === 'failed' || status === 'cancelled') {
          // Handle failed/cancelled generations
          console.log(`❌ Generation ${status}: ${generationId}`);
          toast({
            title: `Generation ${status === 'failed' ? 'Failed' : 'Cancelled'}`,
            description: "Something went wrong with your image generation.",
            variant: "destructive",
          });
          
          // Clean up failed generation
          setBackgroundGenerations(prev => {
            const updated = new Map(prev);
            updated.delete(generationId);
            return updated;
          });
        }
        
      } catch (error) {
        console.error('❌ Error processing completion:', error instanceof Error ? error.message : error);
      }
    };

    // Process one completion at a time to avoid race conditions
    processCompletion();
  }, [completionQueue, queryClient, toast]);

  // Immediate cleanup on mount + periodic cleanup for stuck generations
  useEffect(() => {
    // Immediate cleanup on component mount (especially for mobile)
    console.log('🧹 FipFap component mounted - clearing any stuck progress bars');
    setBackgroundGenerations(new Map());
    
    // Periodic cleanup for stuck generations (only runs if there are active generations)
    const cleanupInterval = setInterval(() => {
      setBackgroundGenerations(prev => {
        if (prev.size === 0) return prev; // Skip processing if no generations
        
        const now = Date.now();
        const updated = new Map(prev);
        let hasChanges = false;
        
        prev.forEach((value, key) => {
          // Remove generations stuck for more than 8 minutes (hard cap)
          const generationAge = now - (value.generation.createdAt ? new Date(value.generation.createdAt).getTime() : now);
          if (generationAge > 480000 && !value.isCompleted) { // 8 minutes hard cap
            console.log(`🧹 Cleaning up stuck generation: ${key} (${Math.round(generationAge / 1000)}s old)`);
            if (value.intervalId) {
              clearInterval(value.intervalId);
            }
            updated.delete(key);
            hasChanges = true;
          }
        });
        
        return hasChanges ? updated : prev;
      });
    }, 30000); // Check every 30 seconds (reduced from 15s)
    
    return () => clearInterval(cleanupInterval);
  }, []);

  
  // Handle WebSocket messages for background generation progress
  useEffect(() => {
    if (messageQueue.length === 0) return;

    // Create immutable snapshot to prevent loss when new messages arrive during processing
    const snapshot = [...messageQueue];

    // Process ALL messages in the snapshot
    snapshot.forEach((message) => {
      // DEBUG: Log safe WebSocket message properties (avoiding circular references)
      console.log(`🔍 WebSocket message received - Type: ${message.type}, BatchID: ${message.batchId || message.generationId}, Progress: ${message.progress}`);

      // NEW: Normalize IDs according to architect's guidance
      const batchId = message.batchId || message.generationId;
      const imageId = message.imageId || message.generationId;
      
      if (!batchId) {
        console.log(`⚠️ WebSocket message has no batch ID: Type=${message.type}, UserID=${(message as any).userId}`);
        return;
      }

      console.log(`🎯 Handling WebSocket message: ${message.type} for batch: ${batchId}, image: ${imageId}`);

      switch (message.type) {
      case 'generation_update':
        // MOBILE FIX: Use WebSocket progress values (Safari throttles setInterval)
        const wsProgress = typeof message.progress === 'number' ? message.progress : 0;
        console.log(`📨 WebSocket progress update for batch ${batchId}: ${wsProgress}%`);
        
        if (wsProgress === 100 || message.status === 'completed') {
          console.log(`🎯 WebSocket detected 100% completion for batch: ${batchId} - forcing completion!`);
          
          // Check if already queued/completed to prevent duplicates (use batchId)
          setCompletionQueue(prev => {
            const alreadyQueued = prev.some(item => item.generationId === batchId);
            if (alreadyQueued) {
              console.log(`⚠️ Completion already queued for ${batchId}, skipping duplicate`);
              return prev;
            }
            return [...prev, { generationId: batchId, status: 'completed' }];
          });
          
          // Also update backgroundGenerations if present (use batchId)
          setBackgroundGenerations(prev => {
            const updated = new Map(prev);
            const existing = updated.get(batchId);
            if (existing && !existing.isCompleted) {
              if (existing.intervalId) {
                clearInterval(existing.intervalId);
              }
              updated.set(batchId, {
                ...existing,
                progress: 100,
                isCompleted: true,
                completedImages: existing.totalImages,
                intervalId: undefined
              });
              console.log(`📊 Completion source: ws_update_100 for ${batchId} - ${existing.totalImages}/${existing.totalImages} images`);
            }
            return updated;
          });
        } else if (wsProgress > 0) {
          // Update progress from WebSocket (primary source for mobile compatibility)
          setBackgroundGenerations(prev => {
            const updated = new Map(prev);
            const existing = updated.get(batchId);
            if (existing && !existing.isCompleted) {
              // Only update if WebSocket progress is higher (prevents backwards progress)
              const newProgress = Math.max(existing.progress, wsProgress);
              if (newProgress !== existing.progress) {
                updated.set(batchId, {
                  ...existing,
                  progress: newProgress
                });
                console.log(`📊 WebSocket progress update: ${batchId} now at ${newProgress}%`);
              }
            }
            return updated;
          });
        }
        break;
        
      case 'generation_image_ready':
        // Show popup for EACH individual image completion using imageId
        console.log(`🎉 Individual image ready - batch: ${batchId}, image: ${imageId}, showing completion popup!`);
        
        // CRITICAL FIX: Immediately fetch and insert the new image into the gallery
        // This eliminates the 40-second delay between completion notification and image display
        if (imageId) {
          console.log(`📸 INSTANT IMAGE: Fetching and inserting image ${imageId} immediately...`);
          fetchAndInsertNewImage(imageId);
        }
        
        // IMMEDIATE GALLERY UPDATE: Force refresh all FipFap gallery variants
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0];
            return key === '/api/generations/for-fipfap' || 
                   key === '/api/favorites/for-fipfap' ||
                   key === '/api/generations/processing';
          }
        });
        
        // Queue individual image completion popup with Safari-friendly delay
        // Using setTimeout spacing to prevent Safari from throttling rapid state updates
        setTimeout(() => {
          setCompletionQueue(prev => {
            const alreadyQueued = prev.some(item => item.generationId === imageId && item.type === 'individual');
            if (alreadyQueued) {
              console.log(`⚠️ Individual completion already queued for image ${imageId}, skipping duplicate`);
              return prev;
            }
            return [...prev, { generationId: imageId!, status: 'completed' as const, type: 'individual' as const, batchId }];
          });
        }, 250); // 250ms delay for Safari compatibility
        
        // Update placeholder cards - mark one more as ready
        setImagePlaceholders(prev => {
          const updated = new Map(prev);
          const existing = updated.get(batchId);
          if (existing) {
            const newReadyCount = Math.min(existing.readyCount + 1, existing.totalCount);
            updated.set(batchId, { ...existing, readyCount: newReadyCount });
            console.log(`📦 Placeholder ${newReadyCount}/${existing.totalCount} ready for batch ${batchId}`);
            
            // Remove placeholders when all images are ready (after delay for UI)
            if (newReadyCount >= existing.totalCount) {
              setTimeout(() => {
                setImagePlaceholders(current => {
                  const cleaned = new Map(current);
                  cleaned.delete(batchId);
                  return cleaned;
                });
              }, 5000); // Keep showing for 5 seconds after completion
            }
          }
          return updated;
        });
        
        // Increment completed images count for this BATCH (use batchId for progress tracking)
        setBackgroundGenerations(prev => {
          const updated = new Map(prev);
          const existing = updated.get(batchId);
          if (existing && !existing.isCompleted) {
            const newCompletedImages = existing.completedImages + 1;
            const isAllComplete = newCompletedImages >= existing.totalImages;
            
            // Clear interval if all images are complete
            if (isAllComplete && existing.intervalId) {
              clearInterval(existing.intervalId);
            }
            
            const updatedGeneration = {
              ...existing,
              completedImages: newCompletedImages,
              progress: isAllComplete ? 100 : computeProgress(existing.startTime, newCompletedImages, existing.totalImages),
              isCompleted: isAllComplete,
              intervalId: isAllComplete ? undefined : existing.intervalId
            };
            updated.set(batchId, updatedGeneration);
            console.log(`📷 Image ready for batch ${batchId}: ${newCompletedImages}/${existing.totalImages} (${updatedGeneration.progress}%)`);
          }
          return updated;
        });
        break;
        
      case 'generation_complete':
      case 'generation_batch_complete':
        // Skip batch completion popup since we're showing individual image popups
        console.log(`🔥 Batch completion for: ${batchId} - skipping popup (individual popups already shown)`);
        
        // Just update the state without queuing another popup
        console.log(`📊 Completion source: ws_batch_complete for ${batchId} (no popup queued)`);
        
        // CRITICAL FIX: Only mark complete if we've actually received all images
        // This prevents the progress bar from disappearing before all images arrive
        setBackgroundGenerations(prev => {
          const updated = new Map(prev);
          const existing = updated.get(batchId);
          console.log(`🔍 Found existing generation:`, existing ? `progress ${existing.progress}%, completed: ${existing.isCompleted}, images: ${existing.completedImages}/${existing.totalImages}` : 'not found');
          
          if (existing && !existing.isCompleted) {
            // Only mark complete if we've received all images via generation_image_ready
            const actuallyComplete = existing.completedImages >= existing.totalImages;
            
            if (actuallyComplete) {
              // Clear interval and mark complete
              if (existing.intervalId) {
                clearInterval(existing.intervalId);
              }
              
              const completedGeneration = {
                ...existing,
                progress: 100,
                isCompleted: true,
                completedImages: existing.totalImages,
                intervalId: undefined
              };
              updated.set(batchId, completedGeneration);
              console.log(`✅ Generation batch completed: ${batchId} at 100% (all ${existing.totalImages} images received)`);
            } else {
              // Batch complete signal arrived early - wait for remaining images
              console.log(`⏳ Batch complete signal arrived but only ${existing.completedImages}/${existing.totalImages} images received - waiting for more`);
            }
          } else if (!existing) {
            console.log(`⚠️ Batch completion received for unknown generation: ${batchId}`);
          } else if (existing.isCompleted) {
            console.log(`ℹ️ Batch completion received for already completed generation: ${batchId}`);
          }
          return updated;
        });
        
        break;
        
      case 'generation_delay_warning':
        // Show warning toast when CivitAI is taking longer than expected
        console.log(`⚠️ CivitAI delay warning for batch: ${batchId}`);
        toast({
          title: "CivitAI Service Delay",
          description: message.message || "Still waiting on CivitAI to deliver your images. Their service may be experiencing delays.",
          duration: 10000,
        });
        break;
        
      case 'error':
        // Queue error for processing
        console.log(`📨 WebSocket error message for batch: ${batchId}`, (message as any).error?.message || 'Unknown error');
        setCompletionQueue(prev => [...prev, { generationId: batchId, status: 'failed' }]);
        break;
        
      case 'buzz_awarded':
        // Handle buzz award notifications
        console.log(`💰 Buzz awarded via WebSocket: Amount=${(message as any).amount}, Reason=${(message as any).reason}`);
        const buzzMessage = message as any;
        if (buzzMessage.amount && buzzMessage.reason) {
          showBuzzRewardPopup(
            buzzMessage.amount, 
            buzzMessage.reason, 
            buzzMessage.details || `You earned ${buzzMessage.amount} buzz!`
          );
          
          // Refresh user data to update buzz display
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        }
        break;
        
      default:
        // Ignore other message types
        break;
      }
    });

    // Remove only the messages we just processed, keeping any new messages that arrived
    setMessageQueue(prev => prev.slice(snapshot.length));
  }, [messageQueue, queryClient]);

  // Ref to access current backgroundGenerations inside intervals
  const backgroundGenerationsRef = useRef(backgroundGenerations);
  const queryClientRef = useRef(queryClient);
  
  // Update refs whenever dependencies change
  useEffect(() => {
    backgroundGenerationsRef.current = backgroundGenerations;
  }, [backgroundGenerations]);
  
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);
  
  // Track per-generation poll times for dynamic intervals
  const lastPollTimesRef = useRef<Map<string, number>>(new Map());
  
  // Dynamic backup polling - faster in first 3 min, slower after, hard cutoff at 8 min
  useEffect(() => {
    console.log('🔄 Backup polling system starting with dynamic intervals...');
    
    const checkGenerations = async () => {
      const currentGenerations = backgroundGenerationsRef.current;
      
      if (currentGenerations.size === 0) {
        return; // Silent when no generations
      }
      
      const now = Date.now();
      
      // Check each incomplete background generation
      currentGenerations.forEach(async (gen, generationId) => {
        if (!gen.isCompleted) {
          const generationAge = now - gen.startTime;
          
          // Hard cutoff after 8 minutes - mark as failed
          if (generationAge > 480000) { // 8 minutes
            console.log(`⏰ Generation ${generationId} exceeded 8 minute timeout, marking as failed`);
            setBackgroundGenerations(prev => {
              const updated = new Map(prev);
              updated.delete(generationId);
              return updated;
            });
            lastPollTimesRef.current.delete(generationId);
            return;
          }
          
          // Dynamic polling interval based on age (per generation)
          // First 3 minutes: poll every 15 seconds
          // 3-8 minutes: poll every 60 seconds
          const pollInterval = generationAge < 180000 ? 15000 : 60000;
          const lastPollTime = lastPollTimesRef.current.get(generationId) || 0;
          const timeSinceLastPoll = now - lastPollTime;
          
          // Skip if not enough time has passed for this generation's poll interval
          if (timeSinceLastPoll < pollInterval && lastPollTime > 0) {
            return;
          }
          
          // Update per-generation poll time
          lastPollTimesRef.current.set(generationId, now);
          
          try {
            console.log(`🔍 Backup check for ${generationId} (age: ${Math.round(generationAge/1000)}s, interval: ${pollInterval/1000}s)`);
            
            // Check server status using batch ID
            const statusResponse = await fetch(`/api/generations/${generationId}/status`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              const serverIsComplete = statusData.isComplete || false;
              
              if (serverIsComplete) {
                console.log(`📊 Completion source: backup_poll for ${generationId}`);
                setCompletionQueue(prev => {
                  const alreadyQueued = prev.some(item => item.generationId === generationId);
                  if (alreadyQueued) return prev;
                  return [...prev, { generationId, status: 'completed' }];
                });
                return;
              }
            }
            
            // Check image availability as backup and update progress
            const imageResponse = await fetch(`/api/generations/${generationId}`);
            if (imageResponse.ok) {
              const generationData = await imageResponse.json();
              const availableImages = generationData.images?.length || 0;
              
              // Update completed images count for accurate progress calculation
              if (availableImages > gen.completedImages) {
                console.log(`📊 Backup update: ${availableImages}/${gen.totalImages} images available for ${generationId}`);
                
                // CRITICAL FIX: Also update placeholder cards for visual feedback
                setImagePlaceholders(prev => {
                  const updated = new Map(prev);
                  const existing = updated.get(generationId);
                  if (existing && availableImages > existing.readyCount) {
                    updated.set(generationId, { ...existing, readyCount: Math.min(availableImages, existing.totalCount) });
                    console.log(`📦 Backup: Updated placeholder ${availableImages}/${existing.totalCount} for batch ${generationId}`);
                  }
                  return updated;
                });
                
                // Invalidate queries to refresh images when backup poll finds new ones
                queryClientRef.current.invalidateQueries({ queryKey: ['/api/shared-images'] });
                queryClientRef.current.invalidateQueries({ queryKey: ['/api/generations/recent'] });
                
                setBackgroundGenerations(prev => {
                  const updated = new Map(prev);
                  const existing = updated.get(generationId);
                  if (existing && !existing.isCompleted) {
                    const newCompletedImages = Math.min(availableImages, existing.totalImages);
                    const isAllComplete = newCompletedImages >= existing.totalImages;
                    
                    if (isAllComplete && existing.intervalId) {
                      clearInterval(existing.intervalId);
                    }
                    
                    const updatedGeneration = {
                      ...existing,
                      completedImages: newCompletedImages,
                      progress: isAllComplete ? 100 : computeProgress(existing.startTime, newCompletedImages, existing.totalImages),
                      isCompleted: isAllComplete,
                      intervalId: isAllComplete ? undefined : existing.intervalId
                    };
                    updated.set(generationId, updatedGeneration);
                    console.log(`📊 Backup progress update for ${generationId}: ${newCompletedImages}/${existing.totalImages} (${updatedGeneration.progress}%)`);
                  }
                  return updated;
                });
              }
              
              // Queue completion if all images are ready
              if (availableImages >= gen.totalImages) {
                console.log(`📊 Completion source: backup_images for ${generationId}`);
                setCompletionQueue(prev => {
                  const alreadyQueued = prev.some(item => item.generationId === generationId);
                  if (alreadyQueued) return prev;
                  return [...prev, { generationId, status: 'completed' }];
                });
              }
            }
          } catch (error) {
            console.warn(`⚠️ Backup check failed for ${generationId}:`, error);
          }
        }
      });
    };
    
    // Run check every 15 seconds - the dynamic logic inside handles actual intervals
    const backupInterval = setInterval(checkGenerations, 15000);
    
    return () => {
      console.log('🔄 Backup polling system stopping...');
      clearInterval(backupInterval);
    };
  }, []); // Only depend on mount/unmount
  
  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      // Clear all active intervals
      backgroundGenerations.forEach((gen) => {
        if (gen.intervalId) {
          clearInterval(gen.intervalId);
        }
      });
    };
  }, []); // Only run on unmount
  
  // Show reward popup for completed generation
  const showRewardPopupForGeneration = useCallback(async (generationId: string) => {
    try {
      console.log(`🎉 Preparing reward popup for generation: ${generationId}`);
      
      // Fetch the generation data - apiRequest returns Response, need to parse JSON
      const genRes = await apiRequest('GET', `/api/generations/${generationId}`);
      const generation = await genRes.json() as Generation;
      
      if (generation && generation.id) {
        // Verify the generation has an image before showing popup
        const imageUrl = `/api/images/${generation.id}`;
        
        // Pre-check that image exists by testing the URL
        const imgCheck = await fetch(imageUrl, { method: 'HEAD' });
        if (!imgCheck.ok) {
          console.warn(`⚠️ Image not ready for generation ${generationId}, skipping popup`);
          return;
        }
        
        // Add this popup to the active popups map
        setActivePopups(prev => {
          const newMap = new Map(prev);
          newMap.set(generationId, { generation, generationId, imageUrl });
          return newMap;
        });
        
        console.log(`✨ Reward popup ready for generation: ${generationId}`);
      } else {
        console.warn(`⚠️ Could not fetch generation data for reward popup: ${generationId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to show reward popup for generation ${generationId}:`, error);
    }
  }, []);
  
  // Reference to sourceFilter for use in callback
  const sourceFilterRef = useRef(sourceFilter);
  useEffect(() => {
    sourceFilterRef.current = sourceFilter;
  }, [sourceFilter]);
  
  // Fetch and insert newly generated image at the top of the feed
  // OPTIMIZED: Immediately creates displayable object from generation data, no waiting for sharedImageId
  // NOTE: Only inserts when viewing 'gallery' (personal images) mode - other modes use query invalidation
  const fetchAndInsertNewImage = useCallback(async (generationId: string, retryCount = 0) => {
    const maxRetries = 3;
    const retryDelay = 300; // Faster retry for responsive UX
    
    // Invalidate all FipFap caches so data stays consistent across all views
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === '/api/generations/for-fipfap' || 
               key === '/api/favorites/for-fipfap' ||
               key === '/api/shared-images';
      }
    });
    
    // CRITICAL: Only do immediate insertion when viewing gallery (personal images)
    // Community/favorites views show different data sources and would break with generation data
    if (sourceFilterRef.current !== 'gallery') {
      console.log(`📋 Viewing ${sourceFilterRef.current} mode - skipping immediate insert, cache invalidated`);
      return; // Query invalidation above handles refresh for these views
    }
    
    try {
      console.log(`📥 INSTANT INSERT: Fetching generation ${generationId} (attempt ${retryCount + 1})`);
      
      // Fetch the generation data directly
      const genRes = await apiRequest('GET', `/api/generations/${generationId}`);
      const generationData = await genRes.json();
      
      // CRITICAL: Don't wait for sharedImageId - create displayable object immediately
      // The image URL is available via /api/images/{generationId} endpoint
      if (generationData && generationData.id) {
        console.log(`✅ Generation data received:`, generationData.id);
        
        // Convert generation to SharedImage-compatible format for immediate display
        // Note: /api/images/${id} applies watermarking on-the-fly when storedImagePath is not ready
        const immediateImage: SharedImage = {
          id: generationData.id,
          userId: generationData.userId || user?.id || '',
          generationId: generationData.id,
          imageUrl: `/api/images/${generationData.id}`, // Watermarked image endpoint
          // Pass video fields through so fip-fap slide renders video player immediately
          videoUrl: generationData.videoUrl || undefined,
          videoThumbnailUrl: generationData.videoThumbnailUrl || undefined,
          prompt: generationData.prompt || '',
          negativePrompt: generationData.negativePrompt || '',
          modelUsed: generationData.modelName || generationData.modelId || '',
          characterName: generationData.characterName || 'Unknown',
          sceneName: generationData.sceneName || 'Unknown',
          // Required fields with defaults
          isNSFW: true, // FipFap content
          likes: 0,
          downloads: 0,
          views: 0,
          featured: false,
          rating: 'R',
          // Technical generation details
          seed: generationData.seed || 0,
          steps: generationData.steps || 28,
          cfgScale: generationData.cfgScale || 4.5,
          width: generationData.width || 832,
          height: generationData.height || 1216,
          scheduler: generationData.scheduler || 'Euler',
          clipSkip: generationData.clipSkip || 2,
          // Map loras to include name field (use id as fallback if name not available)
          loras: (generationData.loras || []).map((lora: any) => ({
            id: lora.id,
            name: lora.name || lora.id || 'Unknown',
            strength: lora.strength || 1
          })),
          createdAt: generationData.createdAt || new Date().toISOString(),
        };
        
        // Get current active slide element before modification
        const currentActiveSlide = containerRef.current?.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement;
        
        // Insert at the top of the feed immediately
        setAllImages(prevImages => {
          // Check if this image is already in the feed to avoid duplicates
          const existingIndex = prevImages.findIndex(img => img.id === generationData.id);
          if (existingIndex !== -1) {
            console.log(`⚠️ Image already exists at index ${existingIndex}, not inserting duplicate`);
            return prevImages;
          }
          
          console.log(`🚀 INSTANT: Inserting image ${generationData.id} at top of feed`);
          return [immediateImage, ...prevImages];
        });
        
        // Mark as newly inserted for 'New' badge display
        setNewlyInsertedImages(prev => new Set([...prev, generationData.id]));
        
        // Auto-remove 'New' badge after 30 seconds
        setTimeout(() => {
          setNewlyInsertedImages(prev => {
            const updated = new Set(prev);
            updated.delete(generationData.id);
            return updated;
          });
        }, 30000);
        
        // Maintain user's current position by updating active index
        setActiveIndex(prev => prev + 1);
        
        // Ensure user stays on their current slide after DOM updates
        setTimeout(() => {
          if (currentActiveSlide && containerRef.current) {
            const newActiveSlide = containerRef.current.querySelector(`[data-index="${activeIndex + 1}"]`) as HTMLElement;
            if (newActiveSlide) {
              newActiveSlide.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
          }
        }, 100);
        
        // Invalidate ALL variants of FipFap gallery query (includes parameterized versions)
        // This ensures filtered views also refresh
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0];
            return key === '/api/generations/for-fipfap' || 
                   key === '/api/favorites/for-fipfap' ||
                   key === '/api/shared-images';
          }
        });
        
        console.log(`🎉 INSTANT: Successfully inserted image ${generationData.id} at top of feed`);
      } else {
        // No data yet - retry
        if (retryCount < maxRetries) {
          console.log(`⏳ Generation ${generationId} data not ready, retrying in ${retryDelay}ms...`);
          setTimeout(() => {
            fetchAndInsertNewImage(generationId, retryCount + 1);
          }, retryDelay);
        } else {
          console.log(`⚠️ Generation ${generationId} still not available after ${maxRetries + 1} attempts, invalidating queries`);
          // Fallback: force refresh ALL FipFap gallery variants
          queryClient.invalidateQueries({ 
            predicate: (query) => {
              const key = query.queryKey[0];
              return key === '/api/generations/for-fipfap' || 
                     key === '/api/favorites/for-fipfap' ||
                     key === '/api/shared-images';
            }
          });
        }
      }
    } catch (error) {
      console.error(`❌ Failed to fetch and insert new image:`, error);
      // Retry on error
      if (retryCount < maxRetries) {
        setTimeout(() => {
          fetchAndInsertNewImage(generationId, retryCount + 1);
        }, retryDelay);
      } else {
        // Fallback: force refresh ALL FipFap gallery variants
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0];
            return key === '/api/generations/for-fipfap' || 
                   key === '/api/favorites/for-fipfap' ||
                   key === '/api/shared-images';
          }
        });
      }
    }
  }, [queryClient, user?.id, activeIndex]);
  
  // Community sharing mutation
  const shareToCommunityMutation = useMutation({
    mutationFn: async (generationId: string) => {
      console.log(`📤 Sharing generation to community: ${generationId}`);
      
      // Send generationId with explicit R rating for FipFap images
      const shareData = {
        generationId: generationId,
        rating: 'R', // FipFap images default to R rating for community visibility
      };
      
      console.log('📋 Sharing request:', shareData);
      
      // Share to community via API - server handles ownership, validation, and data construction
      const sharedRes = await apiRequest('POST', '/api/shared-images', shareData);
      const sharedImage = await sharedRes.json();
      
      console.log('✅ Successfully shared to community:', sharedImage);
      return sharedImage;
    },
    onSuccess: (response) => {
      // Show success notification
      toast({
        title: "Shared to Community! 🌟",
        description: "Your image is now visible in the community feed and will be stored for 1 year.",
        duration: 3000,
      });
      
      // Show buzz reward popup if buzzAwarded is included in response
      if (response?.buzzAwarded) {
        showBuzzRewardPopup(response.buzzAwarded, 'share', 'Thank you for sharing with the community!');
      } else {
        // Fallback to default 6 buzz for sharing
        showBuzzRewardPopup(6, 'share', 'Thank you for sharing with the community!');
      }
      
      // Refresh the appropriate feed to show the new image
      const { queryKey } = getQueryConfig();
      queryClient.invalidateQueries({ queryKey: [queryKey[0]] });
      
      // Refresh user data to update buzz display
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: (error: any) => {
      console.error('❌ Failed to share to community:', error);
      
      // Show specific error messages based on server response
      let title = "Sharing Failed";
      let description = "Unable to share to community. Please try again.";
      
      if (error.message) {
        if (error.message.includes("already shared")) {
          title = "Already Shared";
          description = "This image has already been shared to the community.";
        } else if (error.message.includes("Not authorized")) {
          title = "Not Authorized";
          description = "You can only share your own generated images.";
        } else if (error.message.includes("must be completed")) {
          title = "Generation Incomplete";
          description = "Please wait for the image generation to complete before sharing.";
        } else if (error.message.includes("not found")) {
          title = "Image Not Found";
          description = "The image you're trying to share could not be found.";
        } else {
          description = error.message;
        }
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    }
  });
  
  // Handle sharing a completed generation to community
  const handleShareToCommunity = useCallback((generationId: string) => {
    shareToCommunityMutation.mutate(generationId);
  }, [shareToCommunityMutation]);
  
  // Show buzz reward popup
  const showBuzzRewardPopup = useCallback((amount: number, reason: 'share' | 'like' | 'generation', details?: string) => {
    setBuzzReward({ amount, reason, details });
    setShowBuzzReward(true);
  }, []);

  // Centralized completion handler to prevent duplicates and handle all completion scenarios
  const handleGenerationCompletion = useCallback((generationId: string, status: 'completed' | 'failed' | 'cancelled') => {
    // Synchronous idempotency check to prevent race conditions
    if (completedGenerationIdsRef.current.has(generationId)) {
      console.log(`⚠️ Generation ${generationId} already handled, skipping duplicate`);
      return;
    }

    // Mark as handled immediately (synchronous)
    completedGenerationIdsRef.current.add(generationId);

    // Update background generations
    setBackgroundGenerations(prev => {
      const updated = new Map(prev);
      const existing = updated.get(generationId);
      if (existing && !existing.isCompleted) {
        const updatedGeneration = {
          ...existing,
          progress: status === 'completed' ? 100 : existing.progress,
          isCompleted: true,
          completedImages: status === 'completed' ? existing.totalImages : existing.completedImages // Fix: Update completed count on success
        };
        updated.set(generationId, updatedGeneration);
        
        if (status === 'completed') {
          console.log(`🎉 Generation completed: ${generationId} - ${existing.totalImages}/${existing.totalImages} images`);
          
          // Trigger completion actions
          fetchAndInsertNewImage(generationId);
          showRewardPopupForGeneration(generationId);
          
          // Refresh shared images gallery only - generations/recent handled by optimistic updates
          queryClient.refetchQueries({ queryKey: ['/api/shared-images'] });
          // Skip /api/generations/recent refetch to preserve optimistic cache entries
        } else {
          console.log(`❌ Generation ${status}: ${generationId}`);
          
          // Show error notification for failed/cancelled
          toast({
            title: "Generation Failed",
            description: `Image generation was ${status}`,
            variant: "destructive",
          });
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          setBackgroundGenerations(current => {
            const newMap = new Map(current);
            newMap.delete(generationId);
            return newMap;
          });
          // Clean up from completed set after removal
          completedGenerationIdsRef.current.delete(generationId);
        }, 5000);
      }
      return updated;
    });
  }, [fetchAndInsertNewImage, showRewardPopupForGeneration, queryClient, toast]);
  
  // Process completion queue after functions are available
  useEffect(() => {
    if (completionQueue.length === 0) return;
    
    // Process all queued completions
    completionQueue.forEach(({ generationId, status }) => {
      handleGenerationCompletion(generationId, status);
    });
    
    // Clear the queue
    setCompletionQueue([]);
  }, [completionQueue, handleGenerationCompletion]);
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Background generation mutation
  const backgroundGenerationMutation = useMutation({
    mutationFn: async (generationData: any) => {
      try {
        const response = await apiRequest('POST', '/api/generations', generationData);
        // Parse JSON response to get the generation object
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('❌ Background generation failed:', error);
        throw error;
      }
    },
    onSuccess: (generation: Generation) => {
      // Validate generation has ID
      if (!generation?.id) {
        console.error('❌ Invalid generation response - missing ID:', generation);
        return;
      }
      
      console.log(`🎯 Tracking background generation: ${generation.id} (${generation.quantity} images)`);
      
      const startTime = Date.now();
      const totalImages = generation.quantity || 1;
      
      // Start progress interval for time-based updates (with hard timeout cap)
      const maxGenerationTime = 8 * 60 * 1000; // 8 minute hard cap
      const intervalId = setInterval(() => {
        setBackgroundGenerations(prev => {
          const updated = new Map(prev);
          const existing = updated.get(generation.id);
          if (existing && !existing.isCompleted) {
            // Hard cap: stop tracking after 8 minutes to prevent infinite intervals
            const elapsed = Date.now() - existing.startTime;
            if (elapsed > maxGenerationTime) {
              console.log(`⏰ Hard cap reached for ${generation.id} - cleaning up interval`);
              clearInterval(intervalId);
              updated.delete(generation.id);
              return updated;
            }
            const newProgress = computeProgress(existing.startTime, existing.completedImages, existing.totalImages);
            updated.set(generation.id, {
              ...existing,
              progress: newProgress
            });
          }
          return updated;
        });
      }, 3000); // Update every 3 seconds (reduced from 1s to save compute)
      
      // Track this background generation with time-based progress
      setBackgroundGenerations(prev => {
        const updated = new Map(prev);
        updated.set(generation.id, {
          generation,
          progress: 10, // Start at 10% to show API call succeeded
          isCompleted: false,
          startTime,
          totalImages,
          completedImages: 0,
          intervalId
        });
        console.log(`📊 Background generations map size: ${updated.size}`);
        return updated;
      });
      
      // Add placeholder cards for individual images
      setImagePlaceholders(prev => {
        const updated = new Map(prev);
        updated.set(generation.id, {
          batchId: generation.id,
          totalCount: totalImages,
          readyCount: 0,
          startTime
        });
        console.log(`📦 Added ${totalImages} placeholder card(s) for batch ${generation.id}`);
        return updated;
      });
      
      // Refresh main generations list only - recent handled by optimistic updates
      queryClient.refetchQueries({ queryKey: ['/api/generations'] });
      // Skip /api/generations/recent to preserve optimistic cache entries in gallery
      
      toast({
        title: "Generation Started! 🎨",
        description: "Your image is being generated in the background. Check your gallery to see the results.",
        duration: 2000,
      });
    },
    onError: (error: any) => {
      console.error("❌ Background generation error:", error);
      let errorMessage = "Failed to start generation";
      
      if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Check if there are any active background generations
  const hasActiveBackgroundGenerations = backgroundGenerations.size > 0;
  const activeGenerationsList = Array.from(backgroundGenerations.values());
  
  // Generation request handler - opens modifiers sheet
  // Helper functions to convert size numbers to prompt terms
  const getBreastSizeTerm = (size: number): string => {
    const sizes = ['small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'gigantic_breasts'];
    return sizes[Math.max(0, Math.min(4, size - 1))];
  };
  
  const getAssSizeTerm = (size: number): string => {
    const sizes = ['small_ass', 'tight_ass', 'medium_ass', 'large_ass', 'huge_ass'];
    return sizes[Math.max(0, Math.min(4, size - 1))];
  };
  
  // Remove existing breast size terms from prompt (handles various formats)
  const removeExistingBreastSize = (prompt: string): string => {
    // Common breast size terms and variations
    const breastSizeTerms = [
      'flat_chest', 'flat chest', 'flat-chest',
      'small_breasts', 'small breasts', 'small-breasts', 'small_tits', 'small tits', 'small-tits',
      'medium_breasts', 'medium breasts', 'medium-breasts', 'medium_tits', 'medium tits', 'medium-tits',
      'large_breasts', 'large breasts', 'large-breasts', 'large_tits', 'large tits', 'large-tits',
      'huge_breasts', 'huge breasts', 'huge-breasts', 'huge_tits', 'huge tits', 'huge-tits',
      'gigantic_breasts', 'gigantic breasts', 'gigantic-breasts', 'gigantic_tits', 'gigantic tits', 'gigantic-tits',
      'perky_breasts', 'perky breasts', 'perky-breasts', 'perky_tits', 'perky tits', 'perky-tits',
      'saggy_breasts', 'saggy breasts', 'saggy-breasts', 'saggy_tits', 'saggy tits', 'saggy-tits'
    ];
    
    let cleaned = prompt;
    
    // Remove each term with or without parentheses
    breastSizeTerms.forEach(term => {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // With parentheses
      cleaned = cleaned.replace(new RegExp(`\\(\\s*${escapedTerm}\\s*\\)`, 'gi'), '');
      // Without parentheses
      cleaned = cleaned.replace(new RegExp(`\\b${escapedTerm}\\b`, 'gi'), '');
    });
    
    // Clean up any double commas, spaces, or leading/trailing commas
    cleaned = cleaned.replace(/,\s*,/g, ',');
    cleaned = cleaned.replace(/,\s*$/g, '');
    cleaned = cleaned.replace(/^\s*,/g, '');
    cleaned = cleaned.trim();
    
    return cleaned;
  };
  
  // Remove existing ass size terms from prompt (handles various formats)
  const removeExistingAssSize = (prompt: string): string => {
    // Common ass size terms and variations
    const assSizeTerms = [
      'small_ass', 'small ass', 'small-ass',
      'tight_ass', 'tight ass', 'tight-ass', 'tight_little_ass', 'tight little ass', 'tight-little-ass',
      'medium_ass', 'medium ass', 'medium-ass',
      'large_ass', 'large ass', 'large-ass',
      'huge_ass', 'huge ass', 'huge-ass',
      'gigantic_ass', 'gigantic ass', 'gigantic-ass',
      'bubble_butt', 'bubble butt', 'bubble-butt',
      'fat_ass', 'fat ass', 'fat-ass'
    ];
    
    let cleaned = prompt;
    
    // Remove each term with or without parentheses
    assSizeTerms.forEach(term => {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // With parentheses
      cleaned = cleaned.replace(new RegExp(`\\(\\s*${escapedTerm}\\s*\\)`, 'gi'), '');
      // Without parentheses
      cleaned = cleaned.replace(new RegExp(`\\b${escapedTerm}\\b`, 'gi'), '');
    });
    
    // Clean up any double commas, spaces, or leading/trailing commas
    cleaned = cleaned.replace(/,\s*,/g, ',');
    cleaned = cleaned.replace(/,\s*$/g, '');
    cleaned = cleaned.replace(/^\s*,/g, '');
    cleaned = cleaned.trim();
    
    return cleaned;
  };
  
  const replaceBothSizes = (prompt: string, breastSz: number, assSz: number): string => {
    // Remove existing breast and ass size terms
    let updatedPrompt = removeExistingBreastSize(prompt);
    updatedPrompt = removeExistingAssSize(updatedPrompt);
    
    // Add new terms at the beginning with parentheses
    const newBreastTerm = getBreastSizeTerm(breastSz);
    const newAssTerm = getAssSizeTerm(assSz);
    
    return `(${newBreastTerm}), (${newAssTerm}), ${updatedPrompt}`;
  };

  const handleGenerateRequested = useCallback((image: SharedImage) => {
    console.log('🚀 Enhancement requested for image:', {
      id: image.id,
      characterName: image.characterName,
      sceneName: image.sceneName,
      prompt: image.prompt?.substring(0, 100) + '...'
    });
    
    // Open enhancement modal with body size controls and reset custom prompt
    setImageForEnhancement(image);
    setCustomPrompt('');
    setShowEnhanceModal(true);
  }, []);
  
  // Handle quick pick click - add to custom prompt
  const handleQuickPickClick = useCallback((pick: string) => {
    setCustomPrompt(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}, ${pick}` : pick;
    });
  }, []);
  
  // Handle quick pick edit
  const handleQuickPickEdit = useCallback((index: number, newValue: string) => {
    setQuickPicks(prev => {
      const updated = [...prev];
      updated[index] = newValue;
      return updated;
    });
  }, []);
  
  // Reset quick picks to defaults
  const handleResetQuickPicks = useCallback(() => {
    setQuickPicks(DEFAULT_QUICK_PICKS);
  }, [DEFAULT_QUICK_PICKS]);

  // Save quick picks and exit edit mode
  const handleSaveQuickPicks = useCallback(() => {
    setShowEditQuickPicks(false);
    toast({
      title: 'Saved!',
      description: 'Your Quick Picks have been saved.',
      duration: 2000,
    });
  }, [toast]);
  
  // Remove existing age from prompt (detects various formats)
  const removeExistingAge = (prompt: string): string => {
    // Pattern 1: (18yo) or (18 yo) with or without parentheses
    let cleaned = prompt.replace(/\(\s*\d{1,2}\s*yo\s*\)/gi, '');
    
    // Pattern 2: 18yo or 18 yo without parentheses
    cleaned = cleaned.replace(/\b\d{1,2}\s*yo\b/gi, '');
    
    // Pattern 3: 18 years old, 18years old, 18 year old
    cleaned = cleaned.replace(/\b\d{1,2}\s*years?\s+old\b/gi, '');
    
    // Pattern 4: age 18, aged 18, age: 18
    cleaned = cleaned.replace(/\bage[d]?\s*:?\s*\d{1,2}\b/gi, '');
    
    // Pattern 5: 18-year-old or 18 year old (with hyphens)
    cleaned = cleaned.replace(/\b\d{1,2}-?year-?old\b/gi, '');
    
    // Pattern 6: Written numbers (eighteen, nineteen, twenty, etc. years old)
    cleaned = cleaned.replace(/\b(eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\s*years?\s+old\b/gi, '');
    
    // Pattern 7: 18+ or 18+ adult
    cleaned = cleaned.replace(/\b\d{1,2}\+\s*(adult)?\b/gi, '');
    
    // Clean up any double commas, spaces, or leading/trailing commas
    cleaned = cleaned.replace(/,\s*,/g, ','); // Remove double commas
    cleaned = cleaned.replace(/,\s*$/g, ''); // Remove trailing comma
    cleaned = cleaned.replace(/^\s*,/g, ''); // Remove leading comma
    cleaned = cleaned.trim();
    
    return cleaned;
  };
  
  // Handle generation from enhancement modal
  const handleEnhanceGenerate = useCallback(() => {
    if (!imageForEnhancement) return;
    
    console.log('🎨 Generating with enhancement settings:', {
      imageId: imageForEnhancement.id,
      breastSize,
      assSize,
      age,
      customPrompt
    });
    
    // Get current generation settings as fallback
    const fallbackSettings = getGenerationData();
    
    // Build base prompt with breast/ass size adjustments
    let basePrompt = imageForEnhancement.prompt || fallbackSettings.prompt || 'masterpiece, best quality';
    
    // Remove any existing age from the prompt first
    basePrompt = removeExistingAge(basePrompt);
    
    // Apply breast/ass size changes to prompt
    const enhancedPrompt = replaceBothSizes(basePrompt, breastSize, assSize);
    
    // Add character context if available
    let finalPrompt = enhancedPrompt;
    if (imageForEnhancement.characterName) {
      const characterContext = imageForEnhancement.characterName;
      if (!finalPrompt.toLowerCase().includes(characterContext.toLowerCase())) {
        finalPrompt = `${characterContext}, ${finalPrompt}`;
      }
    }
    
    // Add new age to prompt in format (XXyo)
    finalPrompt = `(${age}yo), ${finalPrompt}`;
    
    // Add custom prompt additions if provided
    if (customPrompt.trim()) {
      finalPrompt = `${finalPrompt}, ${customPrompt.trim()}`;
    }
    
    // Explicit defaults for FipFap enhance generation (3rd tier fallback)
    const FIPFAP_DEFAULTS = {
      modelId: '3c4e0676-03d8-41d0-9eb8-953d8662b098', // CyberRealistic Pony
      scheduler: 'Euler',
      width: 832,
      height: 1216,
      steps: 28,
      cfgScale: 4.5,
      clipSkip: 2
    };
    
    // Helper to normalize cfgScale - database stores as int*10 (45 = 4.5), need to convert back
    const normalizeCfgScale = (val: number | null | undefined): number => {
      if (!val) return FIPFAP_DEFAULTS.cfgScale;
      // If value > 20, it's stored in int*10 format, divide by 10
      return val > 20 ? val / 10 : val;
    };
    
    // Prepare generation data with 3-tier fallback: image -> panel -> defaults
    const generationData = {
      prompt: finalPrompt,
      negativePrompt: imageForEnhancement.negativePrompt || fallbackSettings.negativePrompt || '',
      modelId: imageForEnhancement.modelId || fallbackSettings.modelId || FIPFAP_DEFAULTS.modelId,
      width: imageForEnhancement.width || fallbackSettings.width || FIPFAP_DEFAULTS.width,
      height: imageForEnhancement.height || fallbackSettings.height || FIPFAP_DEFAULTS.height,
      steps: imageForEnhancement.steps || fallbackSettings.steps || FIPFAP_DEFAULTS.steps,
      cfgScale: normalizeCfgScale(imageForEnhancement.cfgScale) || normalizeCfgScale(fallbackSettings.cfgScale) || FIPFAP_DEFAULTS.cfgScale,
      scheduler: imageForEnhancement.scheduler || fallbackSettings.scheduler || FIPFAP_DEFAULTS.scheduler,
      clipSkip: imageForEnhancement.clipSkip || fallbackSettings.clipSkip || FIPFAP_DEFAULTS.clipSkip,
      seed: -1, // Always use random seed for variations
      quantity: 4, // Generate 4 images
      loras: imageForEnhancement.loras || []
    };
    
    console.log('🎨 Submitting generation with enhancements (3-tier fallback):', generationData);
    console.log('🔧 Settings source: image=', !!imageForEnhancement.modelId, 'panel=', !!fallbackSettings.modelId, 'default=', !imageForEnhancement.modelId && !fallbackSettings.modelId);
    
    // Submit generation using background mutation
    backgroundGenerationMutation.mutate(generationData);
    
    // Close modal and reset custom prompt
    setShowEnhanceModal(false);
    setImageForEnhancement(null);
    setCustomPrompt('');
  }, [imageForEnhancement, breastSize, assSize, age, customPrompt, getGenerationData, backgroundGenerationMutation]);

  // Handle modifiers confirmation - trigger background generation
  const handleModifiersConfirm = useCallback((selectedModifiers: string[], quantity: number, updatedPrompt?: string) => {
    if (!selectedImageForGeneration) return;
    
    console.log('🎨 Modifiers confirmed:', selectedModifiers);
    console.log('📊 Quantity selected:', quantity);
    console.log('🔄 Updated prompt:', updatedPrompt);
    console.log('🖼️ For image:', selectedImageForGeneration);
    
    // Get current generation settings as fallback only
    const fallbackSettings = getGenerationData();
    
    // Build base prompt - use updated prompt with breast size changes if provided
    let enhancedPrompt = updatedPrompt || selectedImageForGeneration.prompt || fallbackSettings.prompt || 'masterpiece, best quality';
    
    // Add character context if available
    if (selectedImageForGeneration.characterName) {
      // Extract character description but avoid duplication
      const characterContext = selectedImageForGeneration.characterName;
      if (!enhancedPrompt.toLowerCase().includes(characterContext.toLowerCase())) {
        enhancedPrompt = `${characterContext}, ${enhancedPrompt}`;
      }
    }
    
    // Apply selected modifiers to enhance the prompt
    if (selectedModifiers.length > 0) {
      const modifierText = selectedModifiers.join(', ');
      enhancedPrompt = `${enhancedPrompt}, ${modifierText}`;
    }
    
    // Explicit defaults for FipFap generation (3rd tier fallback)
    const FIPFAP_DEFAULTS = {
      modelId: '3c4e0676-03d8-41d0-9eb8-953d8662b098', // CyberRealistic Pony
      scheduler: 'Euler',
      width: 832,
      height: 1216,
      steps: 28,
      cfgScale: 4.5,
      clipSkip: 2
    };
    
    // Helper to normalize cfgScale - database stores as int*10 (45 = 4.5), need to convert back
    const normalizeCfgScale = (val: number | null | undefined): number => {
      if (!val) return FIPFAP_DEFAULTS.cfgScale;
      // If value > 20, it's stored in int*10 format, divide by 10
      return val > 20 ? val / 10 : val;
    };
    
    // ✅ Use 3-tier fallback: image -> panel -> defaults
    const generationData = {
      prompt: enhancedPrompt,
      negativePrompt: selectedImageForGeneration.negativePrompt || fallbackSettings.negativePrompt || '',
      characterId: selectedImageForGeneration.characterId || (fallbackSettings as Record<string, any>).characterId,
      characterName: selectedImageForGeneration.characterName || (fallbackSettings as Record<string, any>).characterName,
      sceneName: selectedImageForGeneration.sceneName || (fallbackSettings as Record<string, any>).sceneName,
      // ✅ Use 3-tier fallback for technical settings: image -> panel -> defaults
      modelId: selectedImageForGeneration.modelId || fallbackSettings.modelId || FIPFAP_DEFAULTS.modelId,
      steps: selectedImageForGeneration.steps || fallbackSettings.steps || FIPFAP_DEFAULTS.steps,
      cfgScale: normalizeCfgScale(selectedImageForGeneration.cfgScale) || normalizeCfgScale(fallbackSettings.cfgScale) || FIPFAP_DEFAULTS.cfgScale,
      width: selectedImageForGeneration.width || fallbackSettings.width || FIPFAP_DEFAULTS.width,
      height: selectedImageForGeneration.height || fallbackSettings.height || FIPFAP_DEFAULTS.height,
      scheduler: selectedImageForGeneration.scheduler || fallbackSettings.scheduler || FIPFAP_DEFAULTS.scheduler,
      clipSkip: selectedImageForGeneration.clipSkip || fallbackSettings.clipSkip || FIPFAP_DEFAULTS.clipSkip,
      seed: selectedImageForGeneration.seed || fallbackSettings.seed || -1,
      loras: selectedImageForGeneration.loras || fallbackSettings.loras || [],
      quantity: quantity,
      // Track which shared image this was enhanced from
      sourceSharedImageId: selectedImageForGeneration.id,
      // Track modifiers for rating logic
      enhancementModifiers: selectedModifiers
    };
    
    console.log('🚀 Starting background generation with CURRENT IMAGE settings:', generationData);
    console.log('📋 Source image data:', selectedImageForGeneration);
    
    // Trigger background generation
    backgroundGenerationMutation.mutate(generationData);
    
    // Clean up and close sheet
    setSelectedImageForGeneration(null);
    setShowModifiersSheet(false);
  }, [selectedImageForGeneration, getGenerationData, backgroundGenerationMutation]);

  // Handle modifiers sheet close
  const handleModifiersClose = useCallback(() => {
    setShowModifiersSheet(false);
    setSelectedImageForGeneration(null);
  }, []);

  const limit = 40; // Load 40 images at a time for smoother scrolling

  // Get processed image URL - always use watermarking endpoint
  const getImageUrl = (image: SharedImage) => {
    // For gallery mode, image.id IS the generation ID
    if (sourceFilter === 'gallery') {
      return `/api/images/${image.id}`;
    }
    // For favorites, use generationId which links to original generation
    if (sourceFilter === 'favorites' && image.generationId) {
      return `/api/images/${image.generationId}`;
    }
    // For community images, use shared images watermarking endpoint
    return `/api/shared-images/${image.id}/image`;
  };

  // Dynamic query based on selected source and search filter
  const getQueryConfig = () => {
    let endpoint: string;
    let queryKey: any[];
    
    // Add search filter to query parameters
    const searchParams = searchFilter.type && searchFilter.value ? {
      searchType: searchFilter.type,
      searchValue: searchFilter.value
    } : {};
    
    switch (sourceFilter) {
      case 'gallery':
        endpoint = '/api/generations/for-fipfap';
        queryKey = ['/api/generations/for-fipfap', {
          character: characterFilter === 'all' ? undefined : characterFilter,
          offset,
          limit,
          ...searchParams
        }];
        break;
      case 'favorites':
        endpoint = '/api/favorites/for-fipfap';
        queryKey = ['/api/favorites/for-fipfap', {
          offset,
          limit,
          ...searchParams
        }];
        break;
      default: // 'community'
        endpoint = '/api/shared-images';
        queryKey = ['/api/shared-images', {
          character: characterFilter === 'all' ? undefined : characterFilter,
          offset,
          limit,
          nsfw: false,
          sort: sortOrder,
          excludeOwn: excludeOwnImages ? 'true' : undefined,
          ...searchParams
        }];
        break;
    }
    
    return { endpoint, queryKey };
  };

  // Query for images with pagination and random start support
  const { data: paginatedData, isLoading } = useQuery<PaginatedSharedImagesResponse>({
    queryKey: getQueryConfig().queryKey,
    queryFn: async () => {
      const { endpoint } = getQueryConfig();
      const { nextStartOffset, sessionUsed } = getStoredOffsetData();
      
      const params = new URLSearchParams({
        limit: limit.toString()
      });
      
      // Random start is only applicable to community images (unless sequential mode is enabled)
      if (sourceFilter === 'community') {
        // All content on this platform is NSFW - no filtering needed
        
        // In sequential mode — and for trending, whose whole point is the
        // top of the ranking — always use standard offset-based pagination.
        if (sequentialMode || sortOrder === 'trending') {
          params.append('offset', offset.toString());
          console.log(`📋 Sequential mode: Using offset ${offset}`);
        } else {
          // Use stored offset if available and session not used, otherwise use randomStart
          if (nextStartOffset !== null && !sessionUsed) {
            params.append('offset', nextStartOffset.toString());
            console.log(`🎯 Using stored offset: ${nextStartOffset} (persistent random start)`);
            resilientStorage.setSessionItem('fipfap:sessionOffsetUsed', 'true');
          } else if (offset === 0) {
            // Request random start from server for initial load
            params.append('randomStart', 'true');
            console.log(`🎲 Requesting random start from server`);
          } else {
            // Use current offset for pagination/filtering
            params.append('offset', offset.toString());
          }
        }
      } else {
        // For personal gallery and favorites, use normal pagination
        params.append('offset', offset.toString());
      }
      
      // Add sort parameter for community images
      if (sourceFilter === 'community') {
        params.append('sort', sortOrder);
      }
      
      // Search filter support - override character filtering when search is active
      if (searchFilter.type && searchFilter.value) {
        if (searchFilter.type === 'character') {
          params.append('character', searchFilter.value);
        } else if (searchFilter.type === 'prompt') {
          params.append('promptSearch', searchFilter.value);
        } else if (searchFilter.type === 'rating') {
          params.append('rating', searchFilter.value);
        }
      } else if ((sourceFilter === 'community' || sourceFilter === 'gallery') && characterFilter !== 'all') {
        params.append('character', characterFilter);
      }
      
      const response = await fetch(`${endpoint}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch ${sourceFilter} images`);
      const data = await response.json();
      
      // Store next random offset for future visits (community only, skip in sequential mode)
      if (sourceFilter === 'community' && !sequentialMode && data.total && data.offset !== undefined) {
        storeNextRandomOffset(data.offset, data.total, limit, 'data_fetch');
      }
      
      return data;
    },
  });

  // Query for available characters (only for community and gallery sources)
  const { data: characterOptions = [] } = useQuery<string[]>({
    queryKey: [`/api/${sourceFilter === 'community' ? 'shared-images' : 'generations'}/characters`],
    queryFn: async () => {
      if (sourceFilter === 'favorites') return []; // No character filtering for favorites
      
      const endpoint = sourceFilter === 'community' ? '/api/shared-images/characters' : '/api/generations/characters';
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch characters');
      return response.json();
    },
    enabled: sourceFilter !== 'favorites', // Only fetch if not viewing favorites
  });


  // Update images when data loads
  useEffect(() => {
    if (paginatedData?.images) {
      console.log(`📥 Data loaded: offset=${offset}, apiOffset=${paginatedData.offset}, newImages=${paginatedData.images.length}, hasMore=${paginatedData.hasMore}, total=${paginatedData.total}`);
      
      // Sync actual global offset from API response (important for random-start mode)
      if (paginatedData.offset !== undefined) {
        actualGlobalOffsetRef.current = paginatedData.offset;
        console.log(`📍 Synced actualGlobalOffset to ${paginatedData.offset}`);
      }
      
      // If allImages is empty (from skip or filter reset), replace with new images
      // Otherwise append for normal infinite scroll pagination
      setAllImages(prev => {
        if (prev.length === 0) {
          // Fresh start (skip navigation or filter change)
          console.log(`🔄 Fresh start at offset ${paginatedData.offset ?? offset}: ${paginatedData.images.length} images`);
          return paginatedData.images;
        } else {
          // Append for pagination - prevent duplicates
          const newImages = paginatedData.images.filter(newImg => 
            !prev.some(existingImg => existingImg.id === newImg.id)
          );
          // Update actual offset to account for appended images
          actualGlobalOffsetRef.current = (paginatedData.offset ?? offset) + prev.length;
          console.log(`📝 Appending ${newImages.length} new images to existing ${prev.length} (filtered from ${paginatedData.images.length})`);
          return [...prev, ...newImages];
        }
      });
      // Reset loading more flag
      loadingMoreRef.current = false;
      console.log(`✅ Loading more flag reset, hasMore=${paginatedData.hasMore}`);
    }
  }, [paginatedData, offset]);

  // Reset active index when new data loads
  useEffect(() => {
    if (paginatedData?.images && paginatedData.images.length > 0) {
      setActiveIndex(0); // Start at first image of the random page
      console.log(`📍 Starting at first image of random page (offset: ${offset})`);
    }
  }, [paginatedData?.images, offset]);

  // Reset when source, character filter, or search filter changes
  useEffect(() => {
    setOffset(0);
    setAllImages([]);
    setActiveIndex(0);
    loadingMoreRef.current = false;
    
    // Reset character filter when switching sources
    if (sourceFilter === 'favorites') {
      setCharacterFilter('all');
    }
  }, [sourceFilter, characterFilter, searchFilter]);

  // Intersection Observer for tracking active slide and infinite scroll
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            console.log(`👁️ Observer: element ${index} is intersecting (ratio: ${entry.intersectionRatio.toFixed(2)})`);
            
            // Only update active index if the image is MOSTLY visible (>50%) to prevent using the wrong image for enhancements
            if (entry.intersectionRatio > 0.5) {
              setActiveIndex(prevIndex => {
                if (prevIndex !== index) {
                  console.log(`✅ Updating activeIndex to ${index} (image is ${(entry.intersectionRatio * 100).toFixed(0)}% visible)`);
                  // Update last interacted image ref for reliable enhance button targeting using the ref to avoid stale closure
                  const currentImage = allImagesRef.current[index];
                  if (currentImage) {
                    lastInteractedImageRef.current = currentImage;
                    console.log(`🎯 Updated lastInteractedImage ref to:`, currentImage.id, currentImage.characterName);
                  }
                  return index;
                }
                return prevIndex;
              });
            }

            // Load more when approaching the end - trigger earlier for smoother experience
            // Start loading when 70% through current images or within last 15 images
            const remainingImages = allImages.length - index;
            const percentageThrough = index / allImages.length;
            const nearEnd = remainingImages <= 15 || percentageThrough >= 0.7;
            const hasMore = paginatedData?.hasMore;
            const notLoading = !isLoading;
            const notLoadingMore = !loadingMoreRef.current;
            
            // Debug infinite scroll conditions
            if (nearEnd && hasMore) {
              console.log(`🔄 Infinite scroll check: nearEnd=${nearEnd}, remaining=${remainingImages}, percent=${(percentageThrough * 100).toFixed(0)}%, hasMore=${hasMore}, notLoading=${notLoading}, notLoadingMore=${notLoadingMore}`);
            }
            
            if (nearEnd && hasMore && notLoading && notLoadingMore) {
              console.log(`🚀 Triggering infinite scroll: loading more images at offset ${offset + limit} (${remainingImages} images remaining)`);
              loadingMoreRef.current = true;
              setOffset(prev => prev + limit);
            }
          }
        });
      },
      {
        root: containerRef.current, // Use the actual scroll container as root
        threshold: [0.1, 0.5, 0.9], // Multiple thresholds for better detection
        rootMargin: '100px 0px 200px 0px' // Start loading earlier, especially at bottom
      }
    );
    
    console.log(`📺 Observer configured with root container for ${allImages.length} images`);

    // Observe all slides
    const slides = containerRef.current.querySelectorAll('[data-index]');
    slides.forEach(slide => observerRef.current?.observe(slide));

    // Scroll fallback for when IntersectionObserver misses events (desktop container scroll)
    const handleScroll = () => {
      if (!containerRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const scrollPosition = scrollHeight - (scrollTop + clientHeight);
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
      // Trigger at 70% scroll or when within 500px of bottom
      const nearBottom = scrollPosition < 500 || scrollPercentage >= 0.7;
      
      if (nearBottom && paginatedData?.hasMore && !isLoading && !loadingMoreRef.current) {
        console.log(`📜 Scroll fallback triggered: scrollPosition=${scrollPosition}px, scrollPercent=${(scrollPercentage * 100).toFixed(0)}%`);
        loadingMoreRef.current = true;
        setOffset(prev => prev + limit);
      }
    };

    containerRef.current.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observerRef.current?.disconnect();
      containerRef.current?.removeEventListener('scroll', handleScroll);
    };
  }, [allImages.length, paginatedData?.hasMore, isLoading, limit, offset]);

  // Preload images around active index - aggressive preloading for desktop
  useEffect(() => {
    if (allImages.length === 0) return;

    // Detect if desktop/computer for aggressive preloading
    const isDesktop = window.innerWidth > 768 && !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    
    // More aggressive preloading on desktop, conservative on mobile
    const backwardRange = isDesktop ? 3 : 1;
    const forwardRange = isDesktop ? 15 : 4; // Preload next 15 images on desktop, 4 on mobile
    
    const start = Math.max(0, activeIndex - backwardRange);
    const end = Math.min(allImages.length - 1, activeIndex + forwardRange);

    console.log(`🖼️ Preloading images: ${start} to ${end} (active: ${activeIndex}, isDesktop: ${isDesktop})`);

    for (let i = start; i <= end; i++) {
      const image = allImages[i];
      if (image) {
        const img = new Image();
        const imageUrl = image.generationId ? `/api/images/${image.generationId}` : image.imageUrl;
        img.src = imageUrl;
        
        // Preload with higher priority for next few images
        if (i > activeIndex && i <= activeIndex + 3) {
          img.loading = 'eager';
        }
      }
    }
  }, [activeIndex, allImages]);

  // Track view when image becomes active
  const trackView = useCallback(async (imageId: string) => {
    // Validate imageId exists and is not undefined
    if (!imageId || imageId === 'undefined' || imageId === 'null') {
      console.warn(`⚠️ Attempted to track view for invalid imageId: ${imageId}`);
      return;
    }
    
    // Only track views for community images, not personal gallery or favorites
    if (sourceFilter !== 'community') {
      return;
    }
    
    try {
      await apiRequest('POST', `/api/shared-images/${imageId}/view`);
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
    } catch (error) {
      console.error('Failed to track view:', error);
    }
  }, [queryClient, sourceFilter]);

  // Handle like/unlike functionality (both personal favorites + community likes)
  const likeMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const image = allImages.find(img => img.id === imageId);
      if (!image || !image.generationId) {
        throw new Error('Image not found or missing generationId');
      }
      
      const isFavorited = likedImages.has(imageId);
      
      if (isFavorited) {
        // Remove from both favorites and community likes
        const [favoritesResponse, communityResponse] = await Promise.all([
          apiRequest('DELETE', `/api/favorites/${image.generationId}`, {}),
          apiRequest('POST', `/api/shared-images/${imageId}/like`)
        ]);
        return { favorites: favoritesResponse, community: communityResponse };
      } else {
        // Add to both personal favorites and community likes
        const [favoritesResponse, communityResponse] = await Promise.all([
          apiRequest('POST', '/api/favorites', { generationId: image.generationId }),
          apiRequest('POST', `/api/shared-images/${imageId}/like`)
        ]);
        return { favorites: favoritesResponse, community: communityResponse };
      }
    },
    onSuccess: async (response: any, imageId: string) => {
      console.log('Dual like response:', response); // Debug log
      
      const image = allImages.find(img => img.id === imageId);
      const wasFavorited = likedImages.has(imageId);
      
      // Parse community response to get like status
      const communityRes = await response.community.json();
      
      // Update liked images state
      setLikedImages(prev => {
        const newSet = new Set(prev);
        if (wasFavorited) {
          newSet.delete(imageId);
        } else {
          newSet.add(imageId);
        }
        return newSet;
      });
      
      // Update the image data with new like count from community response
      setAllImages(prev => prev.map(img => {
        if (img.id === imageId) {
          const newLikes = wasFavorited ? Math.max(0, img.likes - 1) : img.likes + 1;
          return { ...img, likes: newLikes };
        }
        return img;
      }));
      
      // Invalidate all relevant caches to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images/liked'] });
      
      toast({
        title: wasFavorited ? "Removed" : "Liked!",
        description: wasFavorited 
          ? "Removed from favorites and community likes" 
          : "Added to favorites and liked in community",
      });
    },
    onError: (error) => {
      console.error('Favorites error:', error); // Debug log
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    },
  });

  const handleLike = (imageId: string) => {
    likeMutation.mutate(imageId);
  };

  // Handle download functionality with mobile support
  const handleDownload = async (image: SharedImage) => {
    try {
      const isVideo = !!(image.videoUrl);
      const imageUrl = isVideo ? image.videoUrl! : getImageUrl(image);
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const ext = isVideo ? 'mp4' : 'jpg';
      const fileName = `${image.characterName || (isVideo ? 'video' : 'image')}-${image.id}.${ext}`;
      
      // Check if Web Share API is available (mobile devices)
      if (navigator.share && navigator.canShare) {
        const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
        const file = new File([blob], fileName, { type: mimeType });
        const shareData = {
          files: [file],
          title: image.characterName || (isVideo ? 'Video' : 'Image'),
          text: isVideo ? 'Save this video to your photos' : 'Save this image to your photos'
        };
        
        // Check if sharing files is supported
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          
          // Track download
          await apiRequest('POST', `/api/shared-images/${image.id}/download`);
          queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
          
          toast({
            title: "Success",
            description: isVideo ? "Video ready to save - select 'Save to Photos'" : "Image ready to save - select 'Save to Photos'",
          });
          return;
        }
      }
      
      // Fallback for desktop or browsers without Web Share API
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      // Track download
      await apiRequest('POST', `/api/shared-images/${image.id}/download`);
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      
      toast({
        title: "Success",
        description: isVideo ? "Video downloaded successfully" : "Image downloaded successfully",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error", 
        description: "Failed to download",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (image: SharedImage) => {
    try {
      console.log(`🗑️ Starting removal of image ${image.id} for user who reported it`);
      
      // IMMEDIATE: Remove image from local state FIRST for instant feedback
      setAllImages(prev => {
        const filteredImages = prev.filter(img => img.id !== image.id);
        console.log(`🗑️ Immediately removed image ${image.id} from local state. ${prev.length} → ${filteredImages.length} images`);
        return filteredImages;
      });
      
      // Update active index immediately
      setActiveIndex(prevIndex => {
        const newLength = allImages.length - 1;
        if (newLength === 0) return 0;
        if (prevIndex >= newLength) return newLength - 1;
        return prevIndex;
      });
      
      // Clear ALL relevant caches BEFORE making API call
      console.log(`🧹 Aggressively clearing all caches for image ${image.id}`);
      queryClient.removeQueries({ queryKey: ['/api/shared-images'] });
      queryClient.removeQueries({ queryKey: ['/api/shared-images/characters'] });
      queryClient.removeQueries({ queryKey: ['/api/shared-images/scenes'] });
      queryClient.removeQueries({ queryKey: ['/api/admin/reported-images'] });
      
      // Remove image from API/database
      await apiRequest('DELETE', `/api/shared-images/${image.id}/report`);
      console.log(`✅ Successfully removed image ${image.id} from server`);
      
      // SUPER AGGRESSIVE: Clear ALL browser caches and force fresh data
      await queryClient.clear(); // Clear entire query cache
      
      // Force immediate refetch with fresh data
      setTimeout(() => {
        console.log(`🔄 Force refreshing all shared images data`);
        queryClient.refetchQueries({ 
          queryKey: ['/api/shared-images'],
          type: 'active' 
        });
      }, 100);
      
      // For the user who reported: Force a complete refresh after 1 second
      setTimeout(() => {
        console.log(`🌟 Complete cache refresh for reporter - ensuring no traces remain`);
        queryClient.invalidateQueries({ 
          queryKey: ['/api/shared-images'],
          refetchType: 'all'
        });
      }, 1000);
      
      toast({
        title: "Content Reported",
        description: "Image has been removed from the feed for policy violation",
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error", 
        description: "Failed to report content. Please try again.",
        variant: "destructive",
      });
      
      // If deletion failed, we need to restore the image to local state
      // Since we removed it optimistically
      console.log(`❌ Deletion failed, this would need to restore image ${image.id} if we had it cached`);
    }
  };

  const handleImageLoad = useCallback(() => {
    // Image loaded callback - could be used for analytics
  }, []);

  // Refs for tracking views with debouncing
  const lastTrackedImageRef = useRef<string | null>(null);
  const trackViewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize trackView to stabilize dependencies
  const memoizedTrackView = useCallback((imageId: string) => {
    console.log(`👁️ Tracking view for image ${imageId}`);
    trackView(imageId);
  }, [trackView]);

  // Track WebSocket lifecycle to suppress random offset generation during reconnections
  const isWebSocketReconnecting = useRef(false);
  const reconnectionSuppressionTimeout = useRef<NodeJS.Timeout | null>(null);
  const userNavigationRef = useRef(false);
  const lastActiveIndexRef = useRef(activeIndex);
  const lastInteractedImageRef = useRef<SharedImage | null>(null);
  const allImagesRef = useRef(allImages);
  
  // Keep allImagesRef in sync with allImages state
  useEffect(() => {
    allImagesRef.current = allImages;
  }, [allImages]);
  
  // Track WebSocket state changes to suppress randomization during disconnections/reconnections
  useEffect(() => {
    if (!isConnected) {
      // WebSocket disconnected - suppress random offset generation
      isWebSocketReconnecting.current = true;
      console.log('🚫 WebSocket disconnection detected - suppressing random offset generation');
      
      // Clear any existing timeout
      if (reconnectionSuppressionTimeout.current) {
        clearTimeout(reconnectionSuppressionTimeout.current);
      }
    } else {
      // WebSocket reconnected - continue suppression for a few more seconds
      console.log('🚫 WebSocket reconnection detected - extending suppression for 5 seconds');
      
      // Clear any existing timeout
      if (reconnectionSuppressionTimeout.current) {
        clearTimeout(reconnectionSuppressionTimeout.current);
      }
      
      // Suppress randomization for 5 seconds after reconnection
      reconnectionSuppressionTimeout.current = setTimeout(() => {
        isWebSocketReconnecting.current = false;
        console.log('✅ WebSocket reconnection suppression ended - random offset generation re-enabled');
      }, 5000);
    }
  }, [isConnected]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectionSuppressionTimeout.current) {
        clearTimeout(reconnectionSuppressionTimeout.current);
      }
    };
  }, []);
  
  // Memoize storeNextRandomOffset to stabilize dependencies  
  const memoizedStoreNextRandomOffset = useCallback((currentOffset: number, total: number, limit: number) => {
    // Only update random offset if this is actual user navigation and not in sequential mode
    if (userNavigationRef.current && !sequentialMode) {
      storeNextRandomOffset(currentOffset, total, limit, 'user_navigation');
      console.log(`📱 Navigation detected: Updated next random start based on current position ${currentOffset}`);
    }
  }, [storeNextRandomOffset, sequentialMode]);

  // Track view when active index or current image changes
  useEffect(() => {
    if (allImages.length > 0 && activeIndex < allImages.length) {
      const currentImage = allImages[activeIndex];
      if (currentImage && currentImage.id && currentImage.id !== 'undefined') {
        // Only track view if it's a different image from the last tracked one
        if (lastTrackedImageRef.current !== currentImage.id) {
          // Clear any existing timeout
          if (trackViewTimeoutRef.current) {
            clearTimeout(trackViewTimeoutRef.current);
          }
          
          // Set new timeout for debounced tracking
          trackViewTimeoutRef.current = setTimeout(() => {
            memoizedTrackView(currentImage.id);
            lastTrackedImageRef.current = currentImage.id;
          }, 300); // 300ms debounce
        }
        
        // Update stored offset for next random start (only for actual user navigation)
        if (activeIndex > 0 && paginatedData?.total && activeIndex !== lastActiveIndexRef.current) {
          // This is actual user navigation between images
          userNavigationRef.current = true;
          const currentOffset = offset + activeIndex;
          memoizedStoreNextRandomOffset(currentOffset, paginatedData.total, limit);
          // Reset flag after processing
          userNavigationRef.current = false;
          lastActiveIndexRef.current = activeIndex;
        }
      } else {
        console.warn(`⚠️ Skipping view tracking for image at index ${activeIndex} - invalid image data:`, currentImage);
      }
    }

    // Cleanup function
    return () => {
      if (trackViewTimeoutRef.current) {
        clearTimeout(trackViewTimeoutRef.current);
      }
    };
  }, [activeIndex, allImages[activeIndex]?.id, memoizedTrackView, memoizedStoreNextRandomOffset, offset, paginatedData?.total, limit]); // Narrowed dependencies

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        event.preventDefault();
        // Go to previous image
        if (activeIndex > 0) {
          setActiveIndex(prev => prev - 1);
          // Scroll to previous image
          if (containerRef.current) {
            const prevSlide = containerRef.current.querySelector(`[data-index="${activeIndex - 1}"]`);
            if (prevSlide) {
              prevSlide.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex]);

  if (isLoading && allImages.length === 0) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading Fip Fap...</div>
      </div>
    );
  }

  // Show message when no images are available
  if (!isLoading && allImages.length === 0) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-white text-xl mb-4">No images available</div>
        <div className="text-gray-400 text-sm text-center max-w-md">
          {searchFilter.type ? (
            <p>No images found for the current filter. Try changing your search or filters.</p>
          ) : sourceFilter === 'community' ? (
            <p>The community gallery is empty or all images are filtered out.</p>
          ) : sourceFilter === 'gallery' ? (
            <p>You haven't generated any images yet. Go to the Generator to create your first image!</p>
          ) : (
            <p>You haven't favorited any images yet.</p>
          )}
        </div>
        {/* Always show Generate button */}
        <Link href="/generate">
          <button
            className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create Your First Image
          </button>
        </Link>
        
        {currentUser?.isAdmin && (
          <button
            onClick={() => {
              setOffset(0);
              setAllImages([]);
              const { queryKey } = getQueryConfig();
              queryClient.invalidateQueries({ queryKey: [queryKey[0]] });
            }}
            className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
          >
            Refresh
          </button>
        )}
      </div>
    );
  }

  // Search results component
  interface SearchResultsProps {
    searchQuery: string;
    searchTab: 'all' | 'characters' | 'prompts' | 'ratings' | 'my-feed';
    onResultClick: (result: SearchResult) => void;
  }

  function SearchResults({ searchQuery, searchTab, onResultClick }: SearchResultsProps) {
    // For ratings tab, show rating options directly
    if (searchTab === 'ratings') {
      const ratingOptions = [
        { id: 'rating_G', name: 'G', description: 'General Audiences', type: 'rating' as const },
        { id: 'rating_PG', name: 'PG', description: 'Parental Guidance Suggested', type: 'rating' as const },
        { id: 'rating_PG-13', name: 'PG-13', description: 'Parents Strongly Cautioned', type: 'rating' as const },
        { id: 'rating_R', name: 'R', description: 'Restricted', type: 'rating' as const },
        { id: 'rating_NC-17', name: 'NC-17', description: 'Adults Only', type: 'rating' as const },
        { id: 'rating_X', name: 'X', description: 'Explicit Content', type: 'rating' as const },
      ];

      return (
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="divide-y divide-gray-800">
            {ratingOptions.map((rating) => (
              <div
                key={rating.id}
                className="flex items-center gap-3 p-4 hover:bg-gray-900 cursor-pointer"
                onClick={() => onResultClick(rating)}
                data-testid={`search-result-rating-${rating.name}`}
              >
                <div className="h-12 w-12 flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg">
                  {rating.name === 'PG-13' || rating.name === 'NC-17' ? rating.name.substring(0, 2) : rating.name}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {rating.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      Rating
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    {rating.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      );
    }

    // For other tabs, use the backend search API
    const { data: searchResults = [], isLoading: searchLoading } = useQuery<SearchResult[]>({
      queryKey: ['/api/fipfap/search', searchQuery, searchTab],
      queryFn: async () => {
        const params = new URLSearchParams({
          q: searchQuery || '', // Allow empty search to show all results
          type: searchTab,
          limit: '20'
        });
        const response = await fetch(`/api/fipfap/search?${params}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        return data.results || [];
      },
      enabled: true, // Always enabled to allow empty search
    });

    if (searchLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400">Searching...</div>
        </div>
      );
    }


    if (searchResults.length === 0) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400">No results found</div>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="divide-y divide-gray-800">
          {searchResults.map((result) => (
            <div
              key={result.id}
              className="flex items-center gap-3 p-4 hover:bg-gray-900 cursor-pointer"
              onClick={() => onResultClick(result)}
              data-testid={`search-result-${result.type}-${result.id}`}
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={result.avatar || ''} />
                <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                  {result.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">
                    {result.name}
                  </span>
                  {result.type === 'character' && (
                    <Badge variant="secondary" className="text-xs">
                      Character
                    </Badge>
                  )}
                </div>
                {result.description && (
                  <div className="text-sm text-gray-300 mt-1">
                    {result.description}
                  </div>
                )}
                {result.matchCount && (
                  <div className="text-xs text-gray-400 mt-1">
                    {result.matchCount} images
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  const currentImagePrompt = allImages[activeIndex]?.prompt || '';
  const isDesktopView = typeof window !== 'undefined' && window.innerWidth > 1024;

  return (
    <div className="h-screen supports-[height:100dvh]:h-[100dvh] overflow-hidden bg-black relative flex">
      {/* Main Content Area */}
      <div className={`flex-1 h-full relative ${showStoryPanel && isDesktopView ? 'lg:pr-0' : ''}`}>
      {/* Search Interface */}
      <div className={`absolute top-0 left-0 right-0 z-50 transition-transform duration-300 ${
        showSearch ? 'translate-y-0' : '-translate-y-full'
      }`}>
        <div className="bg-black h-screen">
          {/* Search Header */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
              className="text-white hover:bg-gray-800"
              data-testid="button-close-search"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search characters, prompts..."
                className="pl-10 pr-10 bg-gray-800 text-white placeholder:text-gray-400 border-none rounded-full"
                data-testid="input-search"
                autoFocus
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded-full text-white hover:bg-gray-700"
                  data-testid="button-clear-search"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          
          {/* Search Tabs */}
          <Tabs value={searchTab} onValueChange={(value: any) => setSearchTab(value)} className="">
            <TabsList className="w-full bg-transparent border-b border-gray-800 rounded-none justify-start px-4">
              <TabsTrigger 
                value="my-feed"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary-500 text-gray-300 data-[state=active]:text-primary-400 rounded-none bg-transparent font-medium"
                data-testid="tab-my-feed"
                onClick={() => {
                  // Clear all search filters and return to random feed
                  setSearchFilter({ type: null, value: null });
                  setSearchQuery('');
                  setAllImages([]);
                  setActiveIndex(0);
                  setHasMore(true);
                  setOffset(0);
                  
                  // Invalidate queries to refetch unfiltered content
                  queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
                  
                  // Close search interface
                  setShowSearch(false);
                  
                  console.log('🏠 Returned to My Feed - all filters cleared');
                }}
              >
                My Feed
              </TabsTrigger>
              <TabsTrigger 
                value="all" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white text-gray-300 data-[state=active]:text-white rounded-none bg-transparent"
                data-testid="tab-all"
              >
                All
              </TabsTrigger>
              <TabsTrigger 
                value="characters" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white text-gray-300 data-[state=active]:text-white rounded-none bg-transparent"
                data-testid="tab-characters"
              >
                Characters
              </TabsTrigger>
              <TabsTrigger 
                value="prompts" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white text-gray-300 data-[state=active]:text-white rounded-none bg-transparent"
                data-testid="tab-prompts"
              >
                Prompts
              </TabsTrigger>
              <TabsTrigger 
                value="ratings" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-white text-gray-300 data-[state=active]:text-white rounded-none bg-transparent"
                data-testid="tab-ratings"
              >
                Ratings
              </TabsTrigger>
            </TabsList>
            
            {/* Search Results */}
            <TabsContent value={searchTab} className="mt-0">
              <SearchResults 
                searchQuery={debouncedSearchQuery}
                searchTab={searchTab}
                onResultClick={(result) => {
                  // Apply search result as filter and reload images
                  if (result.type === 'character') {
                    setSearchFilter({ type: 'character', value: result.name });
                  } else if (result.type === 'prompt') {
                    setSearchFilter({ type: 'prompt', value: result.name });
                  } else if (result.type === 'rating') {
                    setSearchFilter({ type: 'rating', value: result.name });
                  }
                  
                  // Reset feed to show filtered results
                  setAllImages([]);
                  setActiveIndex(0);
                  setHasMore(true);
                  setOffset(0);
                  
                  // Invalidate queries to refetch with new filter
                  queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
                  
                  setShowSearch(false);
                  
                  console.log('🔍 Applied search filter:', result);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Top Left Button Group */}
      <div className={`absolute top-4 left-4 z-40 flex gap-2 transition-opacity duration-300 ${
        showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Search Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSearch(!showSearch)}
          className="text-white hover:bg-white/10"
          data-testid="button-toggle-search"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Gallery Mode Toggle */}
        <Button
          variant={sourceFilter === 'gallery' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            const newMode = sourceFilter === 'community' ? 'gallery' : 'community';
            setSourceFilter(newMode);
            setOffset(0); // Reset to beginning when switching modes
            setAllImages([]); // Clear images to show new gallery
          }}
          className={`text-white ${
            sourceFilter === 'gallery' 
              ? 'bg-purple-600 hover:bg-purple-700' 
              : 'hover:bg-white/10'
          }`}
          data-testid="button-toggle-gallery-mode"
          title={sourceFilter === 'community' ? 'Switch to My Gallery' : 'Switch to Community'}
        >
          <User className="h-4 w-4 mr-1" />
          {sourceFilter === 'gallery' ? 'Mine' : 'Community'}
        </Button>
      </div>

      {/* Hide UI Button - Always visible */}
      <button
        onClick={() => setShowUI(!showUI)}
        className="absolute top-4 right-4 z-50 p-2 text-white hover:text-blue-400 transition-colors hover:scale-110"
        data-testid="button-toggle-ui"
      >
        {showUI ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
      </button>

      {/* Top Right Button Group - Positioned to avoid overlap */}
      <div className={`absolute top-4 right-14 z-40 flex gap-1 sm:gap-2 transition-opacity duration-300 ${
        showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        
        {/* Buzz Display */}
        {user && (
          <div className="flex items-center gap-1 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-sm font-medium" data-testid="buzz-display">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            <span className="text-yellow-400">{user.buzzCredits || 0}</span>
          </div>
        )}
        
        {/* Sort Toggle Button - Only show for community */}
        {sourceFilter === 'community' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const newSortOrder = sortOrder === 'trending' ? 'newest' : sortOrder === 'newest' ? 'oldest' : 'trending';
              setSortOrder(newSortOrder);
              // Reset images and pagination when sort changes
              setAllImages([]);
              setActiveIndex(0);
              setHasMore(true);
              setOffset(0);
              // Invalidate queries to refetch with new sort
              queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
              console.log(`🔄 Sort changed to: ${newSortOrder}`);
            }}
            className="text-white hover:bg-white/10 text-xs px-2"
            data-testid="button-toggle-sort"
          >
            <ArrowUpDown className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline text-xs">
              {sortOrder === 'trending' ? 'Trending' : sortOrder === 'newest' ? 'Newest' : 'Oldest'}
            </span>
          </Button>
        )}
        
        {/* Gallery Button - Navigate to user's generations page */}
        <Link href="/generations">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10 text-xs px-2"
            data-testid="button-gallery"
          >
            <User className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline text-xs">Gallery</span>
          </Button>
        </Link>
        
        {/* Enhanced Generation Button with Onboarding Tooltip */}
        <Coachmark
          title="✨ Enhance Your Images!"
          description="Apply your body size settings and create enhanced variations! Click here to generate improved versions with your chosen proportions."
          ctaText="Click Here"
          isOpen={enhanceCoachmark.isOpen}
          onOpenChange={enhanceCoachmark.handleOpenChange}
          onCTAClick={() => {
            // Handle both CTA click and button action
            enhanceCoachmark.handleCTAClick();
            const currentImage = allImages[activeIndex];
            if (currentImage) {
              console.log('🔧 Enhance CTA using activeIndex:', {
                id: currentImage.id,
                characterName: currentImage.characterName,
                sceneName: currentImage.sceneName,
                activeIndex
              });
              handleGenerateRequested(currentImage);
            }
          }}
          onDismiss={enhanceCoachmark.handleDismiss}
          placement="bottom"
          useAnchor={true}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Use activeIndex for accurate current image
              const currentImage = allImages[activeIndex];
              if (currentImage) {
                console.log('🔧 Enhance button using activeIndex:', {
                  id: currentImage.id,
                  characterName: currentImage.characterName,
                  sceneName: currentImage.sceneName,
                  activeIndex
                });
                handleGenerateRequested(currentImage);
              }
            }}
            className="text-white hover:bg-white/10 text-xs px-2"
            data-testid="button-enhanced-generation"
          >
            <Sparkles className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline text-xs">Enhance</span>
          </Button>
        </Coachmark>
        
        {/* Navigate to Generate Page with Prompt Copy */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Copy current image's prompt and navigate to generate page
            const currentImage = allImages[activeIndex];
            if (currentImage && currentImage.prompt) {
              // Store the prompt in localStorage using the same keys as generation panel
              localStorage.setItem('generationPanel_prompt', JSON.stringify(currentImage.prompt));
              if (currentImage.negativePrompt) {
                localStorage.setItem('generationPanel_negativePrompt', JSON.stringify(currentImage.negativePrompt));
              }
              console.log('📋 Copied prompt from current image:', currentImage.prompt);
            }
            // Navigate to generate page
            window.location.href = '/generate';
          }}
          className="text-white hover:bg-white/10 text-xs px-2"
          data-testid="button-navigate-generate"
        >
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline text-xs">Generate</span>
        </Button>
      </div>

      {/* Main Feed */}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none"
        style={{ 
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {allImages.map((image, index) => {
          // Detect desktop for aggressive loading
          const isDesktop = window.innerWidth > 768 && !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
          
          // Load next 5 images eagerly on desktop, next 2 on mobile
          const eagerLoadRange = isDesktop ? 5 : 2;
          const shouldLoadEagerly = index === activeIndex || (index > activeIndex && index <= activeIndex + eagerLoadRange);
          
          return (
            <div key={`${image.id}-${index}`} data-index={index} className="snap-start snap-always">
              <FipFapSlide
                image={image}
                isActive={index === activeIndex}
                shouldLoadEagerly={shouldLoadEagerly}
                onLoad={handleImageLoad}
                likedImages={likedImages}
                onLike={handleLike}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onEditCharacter={handleEditCharacter}
                showUI={showUI}
                onToggleUI={() => setShowUI(!showUI)}
                onGenerateRequested={handleGenerateRequested}
                isNewlyInserted={newlyInsertedImages.has(image.id)}
                currentUserId={currentUser?.id}
                isAdmin={currentUser?.isAdmin || false}
                availableCharacters={availableCharacters}
                galleryMode={sourceFilter}
              />
            </div>
          );
        })}

        {/* Loading indicator at bottom */}
        {isLoading && allImages.length > 0 && (
          <div className="h-screen flex items-center justify-center bg-black">
            <div className="text-white text-lg">Loading more...</div>
          </div>
        )}
      </div>

      {/* Skip 500 buttons - fixed position at bottom left */}
      {/* These skip by changing the database offset, not by caching all intermediate images */}
      {allImages.length > 0 && showUI && !showEnhanceModal && !showModifiersSheet && (
        <div className="fixed left-4 flex items-center gap-3 z-[60]" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Skip back 500 - jumps to new database offset without loading intermediate images */}
          <button
            onClick={() => {
              // Use actual global offset from API (handles random-start mode correctly)
              const currentGlobalPosition = actualGlobalOffsetRef.current + activeIndex;
              const newGlobalOffset = Math.max(0, currentGlobalPosition - 500);
              console.log(`⏪ Skip back 500: from position ${currentGlobalPosition} (actual offset: ${actualGlobalOffsetRef.current}, activeIndex: ${activeIndex}) to offset ${newGlobalOffset}`);
              // Clear images and fetch from new position - this avoids caching intermediate images
              setAllImages([]);
              setActiveIndex(0);
              setOffset(newGlobalOffset);
            }}
            disabled={isLoading || (actualGlobalOffsetRef.current === 0 && activeIndex === 0)}
            className="flex items-center gap-1 text-white hover:text-blue-400 transition-colors hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="button-skip-back-500"
          >
            <ChevronsLeft className="h-6 w-6" />
            <span className="text-xs">500</span>
          </button>
          
          {/* Current position counter */}
          <span className="text-white text-xs opacity-70">{actualGlobalOffsetRef.current + activeIndex + 1}</span>
          
          {/* Skip forward 500 - jumps to new database offset without loading intermediate images */}
          <button
            onClick={() => {
              // Use actual global offset from API (handles random-start mode correctly)
              const currentGlobalPosition = actualGlobalOffsetRef.current + activeIndex;
              const totalImages = paginatedData?.total ?? 0;
              const newGlobalOffset = Math.min(Math.max(0, totalImages - limit), currentGlobalPosition + 500);
              console.log(`⏩ Skip forward 500: from position ${currentGlobalPosition} (actual offset: ${actualGlobalOffsetRef.current}, activeIndex: ${activeIndex}) to offset ${newGlobalOffset}`);
              // Clear images and fetch from new position - this avoids caching intermediate images
              setAllImages([]);
              setActiveIndex(0);
              setOffset(newGlobalOffset);
            }}
            disabled={isLoading || !paginatedData?.hasMore}
            className="flex items-center gap-1 text-white hover:text-blue-400 transition-colors hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="button-skip-forward-500"
          >
            <span className="text-xs">500</span>
            <ChevronsRight className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Quick Rating Buttons for Admin */}
      {currentUser?.isAdmin && allImages.length > 0 && showUI && !showEnhanceModal && !showModifiersSheet && (
        <div className="fixed left-4 flex gap-2 z-[60]" style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <Button
            onClick={() => handleQuickRating('PG')}
            size="sm"
            disabled={updateCharacterMutation.isPending}
            className={`${allImages[activeIndex]?.rating === 'PG' ? 'bg-green-600 hover:bg-green-700 border-green-500' : 'bg-gray-800/80 hover:bg-gray-700/80 border-gray-600'} text-white border backdrop-blur-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            data-testid="button-quick-rating-pg"
          >
            PG
          </Button>
          <Button
            onClick={() => handleQuickRating('R')}
            size="sm"
            disabled={updateCharacterMutation.isPending}
            className={`${allImages[activeIndex]?.rating === 'R' ? 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500' : 'bg-gray-800/80 hover:bg-gray-700/80 border-gray-600'} text-white border backdrop-blur-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            data-testid="button-quick-rating-r"
          >
            R
          </Button>
          <Button
            onClick={() => handleQuickRating('X')}
            size="sm"
            disabled={updateCharacterMutation.isPending}
            className={`${allImages[activeIndex]?.rating === 'X' ? 'bg-red-600 hover:bg-red-700 border-red-500' : 'bg-gray-800/80 hover:bg-gray-700/80 border-gray-600'} text-white border backdrop-blur-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            data-testid="button-quick-rating-x"
          >
            X
          </Button>
        </div>
      )}

      
      {/* Background Generation Progress Indicator - Positioned below navigation */}
      {hasActiveBackgroundGenerations && (
        <div className="fixed top-20 right-4 z-50 space-y-2" data-testid="background-progress-container">
          {activeGenerationsList
            .filter(({ generation }) => !dismissedProgressBars.has(generation.id))
            .map(({ generation, progress, isCompleted, totalImages, completedImages }) => {
              // Get placeholder info for this batch
              const placeholder = imagePlaceholders.get(generation.id);
              
              return (
              <Card key={generation.id} className="w-80 bg-dark-card border-dark-border shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-sm font-medium text-dark-text">
                        {isCompleted ? 'Generation Complete! 🎉' : `Generating ${totalImages} image${totalImages > 1 ? 's' : ''}...`}
                      </span>
                      {isCompleted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleShareToCommunity(generation.id)}
                          disabled={shareToCommunityMutation.isPending}
                          className="ml-2 h-6 w-6 p-0 hover:bg-dark-hover disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid={`button-share-${generation.id}`}
                        >
                          {shareToCommunityMutation.isPending ? (
                            <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Share className="h-3 w-3 text-blue-400 hover:text-blue-300" />
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-dark-text-secondary">
                        {Math.round(progress)}%
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDismissedProgressBars(prev => new Set([...prev, generation.id]));
                        }}
                        className="h-5 w-5 p-0 hover:bg-red-600/20 transition-colors"
                        data-testid={`dismiss-progress-${generation.id}`}
                      >
                        <X className="h-3 w-3 text-slate-400 hover:text-red-400" />
                      </Button>
                    </div>
                  </div>
                  <Progress 
                    value={progress} 
                    className="h-2 bg-dark-bg"
                    data-testid={`progress-${generation.id}`}
                  />
                  
                  <div className="mt-2 text-xs text-dark-text-secondary">
                    {isCompleted ? (
                      <span className="text-green-400 font-medium">Click the refresh button ↻ at the top to see your images!</span>
                    ) : progress >= 100 ? (
                      <span className="text-yellow-400 font-medium">Almost ready! Click the refresh button ↻ to check for your images.</span>
                    ) : totalImages > 1 ? (
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-dark-text text-sm">{completedImages}/{totalImages} ready</span>
                          <span className="text-[10px] uppercase tracking-wider text-blue-400 animate-pulse">
                            {completedImages > 0 ? 'Processing' : 'Generating'}
                          </span>
                        </div>
                        <div className="flex gap-1.5 h-1.5 w-full">
                          {Array.from({ length: totalImages }).map((_, i) => (
                            <div 
                              key={i} 
                              className={`h-full flex-1 rounded-full transition-all duration-700 ${
                                i < completedImages 
                                  ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.7)]' 
                                  : 'bg-purple-600/20'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      'Using selected modifiers to enhance your image...'
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Generation Reward Popups - Support multiple simultaneous popups */}
      {Array.from(activePopups.entries()).map(([popupId, { generation, generationId, imageUrl }], index) => (
        <GenerationRewardPopup
          key={`popup-${popupId}`}
          isOpen={true}
          onClose={() => {
            setActivePopups(prev => {
              const newMap = new Map(prev);
              newMap.delete(popupId);
              return newMap;
            });
            // iOS Safari fix: Re-snap to current image after popup closes
            // This ensures the view returns to the correct position
            setTimeout(() => {
              if (containerRef.current) {
                const currentSlide = containerRef.current.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement;
                if (currentSlide) {
                  currentSlide.scrollIntoView({ behavior: 'instant', block: 'start' });
                  console.log('📱 FipFap popup closed - re-snapped to image', activeIndex);
                }
              }
            }, 50);
          }}
          generation={generation}
          generationId={generationId}
          imageUrl={imageUrl}
          offsetIndex={index}
          isInFipFapMode={true}
        />
      ))}
      
      {/* Buzz Reward Popup */}
      {buzzReward && (
        <BuzzRewardPopup
          isOpen={showBuzzReward}
          onClose={() => {
            setShowBuzzReward(false);
            setBuzzReward(null);
          }}
          buzzAmount={buzzReward.amount}
          reason={buzzReward.reason}
          details={buzzReward.details}
        />
      )}
      
      {/* Enhancement Modal with Body Size Controls */}
      <Dialog open={showEnhanceModal} onOpenChange={setShowEnhanceModal}>
        <DialogContent className="bg-dark-card border-dark-border text-dark-text max-w-2xl w-[95vw] sm:w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Enhance Image</DialogTitle>
            <DialogDescription className="text-dark-text-secondary">
              Adjust body size settings, add custom prompts, and generate enhanced variations
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4 px-1">
            {/* Breast Size Slider */}
            <div className="space-y-3 touch-manipulation">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Breast Size</label>
                <Badge variant="outline" className="text-xs bg-purple-600/20 border-purple-600/50 text-purple-300">
                  {['Small', 'Medium', 'Large', 'Huge', 'Gigantic'][breastSize - 1]}
                </Badge>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={breastSize}
                onChange={(e) => setBreastSize(parseInt(e.target.value))}
                className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider accent-purple-500"
                data-testid="slider-breast-size"
              />
              <div className="flex justify-between text-xs text-dark-text-secondary px-1">
                <span>Small</span>
                <span>Medium</span>
                <span>Large</span>
                <span>Huge</span>
                <span>Gigantic</span>
              </div>
            </div>
            
            {/* Age Slider */}
            <div className="space-y-3 touch-manipulation">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Age</label>
                <Badge variant="outline" className="text-xs bg-blue-600/20 border-blue-600/50 text-blue-300">
                  {age}yo
                </Badge>
              </div>
              <input
                type="range"
                min="19"
                max="65"
                value={age}
                onChange={(e) => setAge(parseInt(e.target.value))}
                className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider accent-blue-500"
                data-testid="slider-age"
              />
              <div className="flex justify-between text-xs text-dark-text-secondary px-1">
                <span>19</span>
                <span>30</span>
                <span>40</span>
                <span>50</span>
                <span>65</span>
              </div>
            </div>
            
            {/* Ass Size Slider */}
            <div className="space-y-3 touch-manipulation">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Ass Size</label>
                <Badge variant="outline" className="text-xs bg-pink-600/20 border-pink-600/50 text-pink-300">
                  {['Small', 'Tight', 'Medium', 'Large', 'Huge'][assSize - 1]}
                </Badge>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={assSize}
                onChange={(e) => setAssSize(parseInt(e.target.value))}
                className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider accent-pink-500"
                data-testid="slider-ass-size"
              />
              <div className="flex justify-between text-xs text-dark-text-secondary px-1">
                <span>Small</span>
                <span>Tight</span>
                <span>Medium</span>
                <span>Large</span>
                <span>Huge</span>
              </div>
            </div>
            
            {/* Custom Prompt Section */}
            <div className="space-y-3 border-t border-dark-border pt-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Custom Prompt Additions</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditQuickPicks(!showEditQuickPicks)}
                  className="h-7 text-xs"
                  data-testid="button-toggle-edit-quick-picks"
                >
                  <Edit3 className="h-3 w-3 mr-1" />
                  {showEditQuickPicks ? 'Done Editing' : 'Edit Quick Picks'}
                </Button>
              </div>
              
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add custom prompt terms here (e.g., happy, smiling, etc.)"
                className="w-full min-h-[80px] px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-purple-500"
                data-testid="textarea-custom-prompt"
              />
              
              {/* Quick Picks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-text-secondary">Quick Picks - Click to add</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowEditQuickPicks(!showEditQuickPicks)}
                      className="h-6 text-xs"
                      data-testid="button-toggle-edit-quick-picks-section"
                    >
                      <Edit3 className="h-3 w-3 mr-1" />
                      {showEditQuickPicks ? 'Done' : 'Edit'}
                    </Button>
                    {showEditQuickPicks && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleResetQuickPicks}
                          className="h-6 text-xs text-orange-400 hover:text-orange-300"
                          data-testid="button-reset-quick-picks"
                        >
                          Reset
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveQuickPicks}
                          className="h-6 text-xs bg-green-600/20 border-green-600/50 text-green-300 hover:bg-green-600/30 hover:border-green-600"
                          data-testid="button-save-quick-picks"
                        >
                          Save
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto overscroll-contain">
                  {quickPicks.map((pick, index) => (
                    <div key={index} className="relative">
                      {showEditQuickPicks ? (
                        <input
                          type="text"
                          value={pick}
                          onChange={(e) => handleQuickPickEdit(index, e.target.value)}
                          className="w-full px-2 py-1.5 bg-dark-bg border border-purple-600/50 rounded text-xs text-dark-text focus:outline-none focus:ring-1 focus:ring-purple-500"
                          data-testid={`input-quick-pick-${index}`}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickPickClick(pick)}
                          className="w-full h-auto py-1.5 px-2 text-xs border-purple-600/50 hover:bg-purple-600/20 hover:border-purple-600 text-left justify-start"
                          data-testid={`button-quick-pick-${index}`}
                        >
                          <Plus className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{pick}</span>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
              <p className="text-xs text-dark-text-secondary">
                <Sparkles className="h-3 w-3 inline mr-1 text-yellow-400" />
                These settings will be applied to generate 4 enhanced variations of this image
              </p>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-3 flex-col sm:flex-row pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowEnhanceModal(false);
                setShowEditQuickPicks(false);
              }}
              className="border-dark-border hover:bg-dark-hover w-full sm:w-auto min-h-[44px]"
              data-testid="button-cancel-enhance"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnhanceGenerate}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 w-full sm:w-auto min-h-[44px]"
              data-testid="button-generate-enhance"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      {/* Story Panel Toggle Button - Desktop Only */}
      {!showStoryPanel && (
        <button
          onClick={() => setShowStoryPanel(true)}
          className="hidden lg:flex fixed top-1/2 right-0 -translate-y-1/2 z-50 items-center gap-2 bg-purple-600/90 hover:bg-purple-600 text-white px-3 py-4 rounded-l-lg transition-colors shadow-lg"
          data-testid="button-open-story-panel"
        >
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-medium writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>Story</span>
        </button>
      )}

      {/* Story Panel - Desktop Only */}
      {showStoryPanel && (
        <div className="hidden lg:block w-[400px] h-full flex-shrink-0">
          <StoryPanel 
            imagePrompt={currentImagePrompt}
            onClose={() => setShowStoryPanel(false)}
          />
        </div>
      )}

      {/* Mobile Story Sheet */}
      <MobileStorySheet imagePrompt={currentImagePrompt} />
    </div>
  );
}
