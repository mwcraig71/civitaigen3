import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { Sparkles, Settings, ChevronDown, RefreshCw, X, Download, Trash2, FileText, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, isGenerationDeleted, filterDeletedGenerations } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import ImageGallery from './image-gallery';
import GenerationPreviewModal from './generation-preview-modal';
import { GenerationConfirmationModal } from './generation-confirmation-modal';
import { GenerationRewardPopup } from '@/components/generation-reward-popup';
import { EventPromptEditor } from './event-prompt-editor';
import LoRASelector from './lora-selector';
import { enablePushNotifications, pushSupported } from '@/lib/push';
import { CommunityTicker } from './CommunityTicker';
import { useCommunityTicker } from '@/hooks/useCommunityTicker';
import { Model, Generation, SharedImage } from '@/types';
import type { Character, QualityGroup, SavedScene, SavedPrompt, Event } from '@shared/schema';
import type { GenerationFormData } from '@/hooks/use-generation-settings';
import { qualityWords } from './generation-panel/constants';
import { GenerationPanelProps } from './generation-panel/types';
import { saveActiveGenerationsToStorage, convertSharedImageToGeneration } from './generation-panel/utils';
import { useQuickTags } from './generation-panel/use-quick-tags';
import { QuickTagsSection } from './generation-panel/quick-tags-section';
import { ModelSelectionSection } from './generation-panel/model-selection-section';
import { CharacterSection } from './generation-panel/character-section';
import { SceneSelector } from './generation-panel/scene-selector';
import { EventSelector } from './generation-panel/event-selector';
import { GenerationParamsFields } from './generation-panel/generation-params-fields';
import { ActiveGenerationsProgress } from './generation-panel/active-generations-progress';
import { PendingPlaceholdersGrid } from './generation-panel/pending-placeholders-grid';
import { CommunityHighlights } from './generation-panel/community-highlights';
import { AIEnhancementDialog } from './generation-panel/ai-enhancement-dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/**
 * Client-side mirror of the server's detectModelFamily.
 * Returns "pony" | "flux" | "krea2".
 */
function detectModelFamily(
  baseModel: string | null | undefined,
  modelName: string | null | undefined,
): "pony" | "flux" | "krea2" {
  const bm = (baseModel || '').toLowerCase();
  const nm = (modelName || '').toLowerCase();
  if (nm.includes('krea') || bm.includes('krea')) return 'krea2';
  if (bm.includes('flux') || nm.includes('flux')) return 'flux';
  return 'pony';
}

// Schema moved to shared useGenerationSettings hook
// DIFFUS_MODEL_NAME, qualityWords and quick-tag defaults moved to ./generation-panel/constants
// GenerationPanelProps moved to ./generation-panel/types


export default function GenerationPanel({ onImageClick }: GenerationPanelProps) {
  // Use shared generation settings hook
  const { form, clearCorruptedLoRAs, getGenerationData, setGenerationData } = useGenerationSettings({ 
    storagePrefix: 'generationPanel' 
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [activeGenerations, setActiveGenerations] = useState<Map<string, { 
    generation: Generation; 
    progress: number; 
    orderedImages: number; 
    returnedImages: number;
    startTime: number;
    isCompleted: boolean;
    completionStartTime?: number; // When images completed - for 90%→100% animation
    statusMessage?: string; // Queue / status message from server (e.g. "Queued — est. 3m")
  }>>(new Map());
  const [progress, setProgress] = useState(0);
  const [dismissedProgressBars, setDismissedProgressBars] = useState<Set<string>>(new Set());
  
  // Placeholder cards for images being generated (shows spinner while waiting)
  // readyCount tracks images where API said "done" but not yet rendered in gallery
  const [pendingImagePlaceholders, setPendingImagePlaceholders] = useState<Map<string, { 
    batchId: string; 
    count: number; 
    readyCount: number; // Images ready from API but not yet rendered
    startTime: number;
    prompt?: string;
  }>>(new Map());
  
  // Ref to access current placeholder state in intervals (avoids stale closure)
  const pendingPlaceholdersRef = useRef(pendingImagePlaceholders);
  useEffect(() => {
    pendingPlaceholdersRef.current = pendingImagePlaceholders;
  }, [pendingImagePlaceholders]);
  
  // Time-based progress calculation - linear 10% to 89% over 40 seconds
  const computeProgress = useCallback((startTime: number, completedImages: number, totalImages: number): number => {
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
    const timeRatio = Math.min(timeElapsedSec / 40, 1);
    return 10 + (79 * timeRatio);
  }, []);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<GenerationFormData | null>(null);
  const [modelSearchTerm, setModelSearchTerm] = useState('');
  const [showModelSearch, setShowModelSearch] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [characterSearchTerm, setCharacterSearchTerm] = useState('');
  const [showCharacterSearch, setShowCharacterSearch] = useState(false);
  const [showQualityDialog, setShowQualityDialog] = useState(false);
  const [qualitySearchTerm, setQualitySearchTerm] = useState('');
  const [customQualityWords, setCustomQualityWords] = useState<Record<string, string[]>>({});
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupWords, setGroupWords] = useState('');
  const [selectedWordsForGroup, setSelectedWordsForGroup] = useState<string[]>([]);
  const [selectedScene, setSelectedScene] = useState<SavedScene | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedEventStepCount, setSelectedEventStepCount] = useState<number>(0);
  const [isAIEnhancing, setIsAIEnhancing] = useState(false);
  const [aiEnhancementResult, setAiEnhancementResult] = useState<{
    enhancedPrompt: string;
    negativePrompt?: string;
    explanation: string;
  } | null>(null);

  // Event prompt editing state
  const [showEventPromptEditor, setShowEventPromptEditor] = useState(false);
  const [eventStepsForEditing, setEventStepsForEditing] = useState<any[]>([]);
  const [baseEventData, setBaseEventData] = useState<any>(null);

  // Image-to-image state
  const [generationType, setGenerationType] = useState<"txt2img" | "img2img">("txt2img");
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [denoiseStrength, setDenoiseStrength] = useState(75);
  const [useFirstImageSeedOffset, setUseFirstImageSeedOffset] = useState(false);

  // Reward popup state for completed generations - support multiple simultaneous popups (like FipFap)
  const [activePopups, setActivePopups] = useState<Map<string, { generation: Generation; generationId: string; imageUrl: string }>>(new Map());

  const { toast } = useToast();

  // Close search dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      if (showModelSearch && !target.closest('[data-testid="button-quick-search"]') && !target.closest('.model-search-dropdown')) {
        setShowModelSearch(false);
        setModelSearchTerm('');
      }
      
      if (showCharacterSearch && !target.closest('[data-testid="button-character-search"]') && !target.closest('.character-search-dropdown')) {
        setShowCharacterSearch(false);
        setCharacterSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelSearch, showCharacterSearch]);

  // Fetch model favorites and all models to get favorite model details
  const { data: modelFavorites = [], isLoading: favoritesLoading } = useQuery({
    queryKey: ['/api/model-favorites'],
  });
  
  const { data: allModels = [], isLoading: allModelsLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
    staleTime: 12 * 60 * 60 * 1000, // 12 hours - models rarely change
    refetchInterval: false,
    // Bypass browser HTTP cache so freshly-downloaded models appear immediately
    queryFn: async () => {
      const res = await fetch('/api/models', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });
  
  // Filter to only show favorite checkpoint models (exclude LoRAs)
  const favoriteModelIds = new Set((modelFavorites as any[]).map((f: any) => f.modelId));
  const models = allModels.filter(model => 
    favoriteModelIds.has(model.id) && 
    model.type?.toLowerCase() === 'checkpoint'
  );
  const modelsLoading = favoritesLoading || allModelsLoading;

  // Fetch current image provider setting (CivitAI or Diffus)
  const { data: imageProviderStatus } = useQuery<{ provider: string; diffusAvailable: boolean }>({
    queryKey: ['/api/system/image-provider'],
    staleTime: 30000,
  });
  const isDiffusProvider = imageProviderStatus?.provider === 'diffus';

  const { data: characters = [], isLoading: charactersLoading } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
  });

  const { data: qualityGroups = [] } = useQuery<QualityGroup[]>({
    queryKey: ['/api/quality-groups'],
  });

  const { data: userSavedScenes = [] } = useQuery<SavedScene[]>({
    queryKey: ['/api/saved-scenes'],
  });

  const { data: sharedScenes = [] } = useQuery<SavedScene[]>({
    queryKey: ['/api/saved-scenes/shared'],
  });

  // Combine user scenes and shared scenes, ensuring no duplicates
  const savedScenes = useMemo(() => {
    const sceneMap = new Map();
    // Add user scenes first (they take priority)
    userSavedScenes.forEach(scene => sceneMap.set(scene.id, scene));
    // Add shared scenes, but only if ID doesn't already exist
    sharedScenes.forEach(scene => {
      if (!sceneMap.has(scene.id)) {
        sceneMap.set(scene.id, scene);
      }
    });
    return Array.from(sceneMap.values());
  }, [userSavedScenes, sharedScenes]);

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });


  const { data: savedPrompts = [] } = useQuery<SavedPrompt[]>({
    queryKey: ['/api/saved-prompts'],
  });

  // Fetch sanitization rules from public endpoint for preview (not admin-only)
  const { data: sanitizationRules = [] } = useQuery<{ id: string; pattern: string; replacement: string; ruleType: string; isEnabled: boolean }[]>({
    queryKey: ['/api/sanitization-rules/active'],
    staleTime: 60000, // Cache for 1 minute
  });

  // Fetch recent generations with pagination - extract generations array from response
  // CRITICAL: Poll slowly during generation to avoid overwriting WebSocket optimistic updates.
  // Fast polling (3s) races with WebSocket and causes images to disappear.
  const hasActiveGenerations = activeGenerations.size > 0 || pendingImagePlaceholders.size > 0;
  const { data: recentGenerationsResponse } = useQuery<{ generations: Generation[]; hasMore: boolean; total: number }>({
    queryKey: ['/api/generations/recent'],
    // Fixed staleTime — do NOT vary by hasActiveGenerations. When staleTime drops
    // mid-session the query becomes instantly stale and refetchOnWindowFocus
    // fires a refetch that overwrites the optimistic entry before it's confirmed.
    staleTime: 30000,
    refetchInterval: 30000, // Background poll every 30 s as a backup sync
    refetchIntervalInBackground: false,
    // Disable window-focus refetch — new images arrive via WS optimistic insert,
    // not via focus-triggered refetches that race against the optimistic cache.
    refetchOnWindowFocus: false,
  });
  // Filter out deleted generations at the source level - this is the primary defense
  // ImageGallery also filters, but this prevents any rendering of deleted items
  const generations = filterDeletedGenerations(recentGenerationsResponse?.generations ?? []);

  // Fetch larger pool of community images for the ticker
  const { data: communityImages = [] } = useQuery<SharedImage[]>({
    queryKey: ['/api/shared-images/pool', { limit: 200 }],
    queryFn: async (): Promise<SharedImage[]> => {
      const response = await fetch('/api/shared-images?limit=200&nsfw=false');
      if (!response.ok) throw new Error('Failed to fetch community images');
      const data = await response.json();
      return data.images || [];
    },
    staleTime: 60 * 1000, // Cache for 60 seconds
    refetchInterval: 120 * 1000, // Refetch every 2 minutes to keep pool fresh
    placeholderData: [] as SharedImage[], // Keep showing old data while fetching new
  });

  const { user } = useAuth();
  
  // WebSocket recovery callback - re-sync active generations on reconnect
  // Memoized with stable dependencies to prevent reconnection loop
  const handleWebSocketReconnect = useCallback(async () => {
    console.log('🔄 WebSocket reconnected - checking for active generations...');
    
    try {
      // Fetch processing generations from server
      const response = await fetch('/api/generations/processing');
      if (!response.ok) {
        console.error('Failed to fetch processing generations:', response.statusText);
        return;
      }
      
      const processingGenerations: Generation[] = await response.json();
      console.log(`📡 State recovery: Found ${processingGenerations.length} processing generations`);
      
      if (processingGenerations.length > 0) {
        // Track processing generations
        console.log('📡 Tracking processing generation');
        if (processingGenerations[0]) {
          setCurrentGeneration(processingGenerations[0]);
        }
      }
    } catch (error) {
      console.error('❌ Failed to recover state on WebSocket reconnect:', error);
    }
  }, []); // Empty deps - toast is stable, setters are stable
  
  const { messageQueue, setMessageQueue } = useWebSocket((user as any)?.id || '', { onReconnect: handleWebSocketReconnect });
  
  // Get the last message from the queue for processing
  const lastMessage = messageQueue.length > 0 ? messageQueue[messageQueue.length - 1] : null;

  // Show reward popup for completed generation - FipFap-style popup system
  const showRewardPopupForGeneration = useCallback(async (generationId: string) => {
    try {
      console.log(`🎉 Preparing reward popup for generation: ${generationId}`);
      
      // Fetch the generation data - using apiRequest like FipFap does
      const genRes = await apiRequest('GET', `/api/generations/${generationId}`);
      const generation = await genRes.json() as Generation;
      
      if (generation && generation.id) {
        // Verify the generation has an image before showing popup
        const imageUrl = `/api/images/${generation.id}`;
        
        if (generation.imageUrl) {
          // Add this popup to the active popups map
          setActivePopups(prev => {
            const updated = new Map(prev);
            updated.set(generationId, { generation, generationId: generation.id, imageUrl });
            return updated;
          });
          console.log(`✨ Reward popup ready for generation: ${generationId}`);
        } else {
          console.warn(`⚠️ Image not ready for generation ${generationId}, skipping popup`);
        }
      } else {
        console.warn(`⚠️ Could not fetch generation data for reward popup: ${generationId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to show reward popup for generation ${generationId}:`, error);
    }
  }, []);

  // Update user preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: (preferences: { showWatermark?: boolean }) => 
      apiRequest('PUT', '/api/user/preferences', preferences),
    onSuccess: async () => {
      // Force refetch the user data immediately
      await queryClient.refetchQueries({ queryKey: ['/api/auth/user'] });
      await queryClient.refetchQueries({ queryKey: ['/api/user'] });
      toast({
        title: "Watermark Preference Updated", 
        description: "Your watermark preference has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update watermark preference",
        variant: "destructive",
      });
    },
  });

  // saveActiveGenerationsToStorage / loadActiveGenerationsFromStorage moved to
  // ./generation-panel/utils (no closure capture; behavior unchanged).

  const clearActiveGenerations = async () => {
    try {
      // CRITICAL FIX: Call backend to forcefully cleanup ALL polling loops
      const response = await fetch('/api/pollers/cleanup-all', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`🛑 Backend cleaned up ${data.cleaned} active pollers`);
      }
    } catch (error) {
      console.error('❌ Failed to cleanup backend pollers:', error);
    }
    
    // Clear all active generation tracking
    setActiveGenerations(new Map());
    localStorage.removeItem('activeGenerations');
    
    // Clear all placeholder cards
    setPendingImagePlaceholders(new Map());
    
    // Clear current generation
    setCurrentGeneration(null);
    setProgress(0);
    
    console.log('🧹 Cleared all progress: active generations, placeholders, and current generation');
    
    toast({
      title: "All Progress Cleared",
      description: "All stuck generations, placeholders, and progress bars have been cleared.",
    });
  };

  // Silent clear function for auto-close (no toast notification)
  const autoCloseGenerations = () => {
    setActiveGenerations(new Map());
    localStorage.removeItem('activeGenerations');
    
    // Force component re-render by updating a dummy state
    setProgress(0);
    setCurrentGeneration(null);
  };

  // Load active generations from localStorage on mount with cleanup
  useEffect(() => {
    // Clear old localStorage on mount to prevent stale data issues
    console.log('🧹 Cleaning up old localStorage active generations on mount');
    localStorage.removeItem('activeGenerations');
    setActiveGenerations(new Map());
  }, []);

  // Animate progress bar and auto-close when complete
  // Progress goes to 90% when images arrive, then animates to 100% over 20 seconds
  // Auto-closes 3 seconds after reaching 100%
  useEffect(() => {
    if (activeGenerations.size === 0) return;

    // Check if any generations need animation updates (have completionStartTime)
    const completedGenerations = Array.from(activeGenerations.entries()).filter(
      ([_, data]) => data.isCompleted && data.completionStartTime
    );

    if (completedGenerations.length === 0) return;

    // Set up interval to update progress animation (triggers re-render for visual updates)
    const animationInterval = setInterval(() => {
      // Force re-render by updating a timestamp - the visualProgress calculation
      // in the render will use the new Date.now() value
      setActiveGenerations(prev => new Map(prev));
    }, 200); // Update every 200ms for smooth animation

    // Check for generations that should auto-close (23 seconds after completion = 20s animation + 3s delay)
    const autoCloseTimeouts: NodeJS.Timeout[] = [];
    for (const [batchId, data] of completedGenerations) {
      if (data.completionStartTime && !dismissedProgressBars.has(batchId)) {
        const timeSinceComplete = Date.now() - data.completionStartTime;
        const timeUntilClose = Math.max(0, 23000 - timeSinceComplete); // 20s animation + 3s after 100%
        
        if (timeUntilClose === 0) {
          // Should close now - remove from activeGenerations entirely
          setActiveGenerations(prev => {
            const updated = new Map(prev);
            updated.delete(batchId);
            saveActiveGenerationsToStorage(updated);
            return updated;
          });
        } else if (timeUntilClose > 0) {
          // Schedule close - remove from activeGenerations when time comes
          const timeout = setTimeout(() => {
            setActiveGenerations(prev => {
              const updated = new Map(prev);
              updated.delete(batchId);
              saveActiveGenerationsToStorage(updated);
              return updated;
            });
          }, timeUntilClose);
          autoCloseTimeouts.push(timeout);
        }
      }
    }

    return () => {
      clearInterval(animationInterval);
      autoCloseTimeouts.forEach(t => clearTimeout(t));
    };
  }, [activeGenerations, dismissedProgressBars]);

  // convertSharedImageToGeneration moved to ./generation-panel/utils

  // Community ticker (static version - no animations)
  const communityTicker = useCommunityTicker({
    communityData: communityImages as SharedImage[],
    convertToGeneration: convertSharedImageToGeneration,
    initialDisplayCount: 20
  });

  // getSavedValue function moved to shared hook

  // Validate LoRA data after models load - hook handles this automatically
  useEffect(() => {
    if (models.length > 0) {
      // Hook's clearCorruptedLoRAs is called automatically, but we can call it explicitly if needed
      clearCorruptedLoRAs();
    }
  }, [models, clearCorruptedLoRAs]);

  // Form initialization moved to shared hook

  // saveToLocalStorage function moved to shared hook




  // Auto-select preferred model when models load
  useEffect(() => {
    const currentModelId = form.getValues('modelId');
    console.log('🔍 Model auto-selection check:', { 
      modelsLength: models.length, 
      currentModelId, 
      hasCurrentModel: currentModelId && models.find(m => m.id === currentModelId) 
    });
    
    // Don't auto-select if a character with a specific model is already saved —
    // the character's model should take precedence and will be applied by the
    // character-restore useEffect below.
    const savedCharacter = localStorage.getItem('generationPanel_selectedCharacter');
    const characterHasModel = savedCharacter ? (() => { try { const c = JSON.parse(savedCharacter); return !!c?.baseModel; } catch { return false; } })() : false;

    if (models.length > 0 && !characterHasModel && (!currentModelId || currentModelId === '' || !models.find(m => m.id === currentModelId))) {
      // Look for CyberRealistic Pony specifically first, then other preferred models
      const preferredModel = models.find(model => 
        model.name.toLowerCase().includes('cyberrealistic pony') ||
        model.name.toLowerCase().includes('cyber realistic pony')
      ) || models.find(model => 
        model.name.toLowerCase().includes('pony') || 
        model.name.toLowerCase().includes('cyber') ||
        model.name.toLowerCase().includes('realistic')
      ) || models[0]; // Fall back to first model if none found
      
      console.log('🎯 Auto-selecting model:', preferredModel.name, '(', preferredModel.id, ')');
      form.setValue('modelId', preferredModel.id);
      
      // Force trigger form validation to ensure the field is properly registered
      form.trigger('modelId');
      
      // Also save to localStorage to persist the selection
      localStorage.setItem('generationPanel_modelId', JSON.stringify(preferredModel.id));
      
      // Double-check that the value was actually set
      setTimeout(() => {
        const verifyModelId = form.getValues('modelId');
        console.log('🔍 Verification: modelId after setValue:', verifyModelId);
        if (verifyModelId !== preferredModel.id) {
          console.log('⚠️ Model ID was not properly set, retrying...');
          form.setValue('modelId', preferredModel.id, { shouldValidate: true, shouldTouch: true });
        }
      }, 100);
    }
    
    // Check for corrupted LoRA data on startup
    clearCorruptedLoRAs();
  }, [models, form]);

  // Load custom quality words and selected character from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('customQualityWords');
    if (saved && saved.trim() !== '') {
      try {
        setCustomQualityWords(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse custom quality words:', e);
        localStorage.removeItem('customQualityWords');
      }
    }
    
    // Load persisted character from localStorage
    const savedCharacter = localStorage.getItem('generationPanel_selectedCharacter');
    if (savedCharacter && savedCharacter.trim() !== '') {
      try {
        const character = JSON.parse(savedCharacter);
        setSelectedCharacter(character);
      } catch (e) {
        console.error('Failed to parse saved character:', e);
        localStorage.removeItem('generationPanel_selectedCharacter');
      }
    }

    // Load persisted scene from localStorage
    const savedScene = localStorage.getItem('generationPanel_selectedScene');
    if (savedScene && savedScene.trim() !== '') {
      try {
        const scene = JSON.parse(savedScene);
        setSelectedScene(scene);
      } catch (e) {
        console.error('Failed to parse saved scene:', e);
        localStorage.removeItem('generationPanel_selectedScene');
      }
    }

    // Load persisted event from localStorage
    const savedEvent = localStorage.getItem('generationPanel_selectedEvent');
    if (savedEvent && savedEvent.trim() !== '') {
      try {
        const event = JSON.parse(savedEvent);
        setSelectedEvent(event);
      } catch (e) {
        console.error('Failed to parse saved event:', e);
        localStorage.removeItem('generationPanel_selectedEvent');
      }
    }

  }, [form, toast]);

  // Listen for "Reuse" button clicks from sidebar/gallery to reload settings
  useEffect(() => {
    const handleGenerationDataUpdate = (event: CustomEvent) => {
      console.log('🔄 Generation panel: Reloading settings from localStorage...', event.detail);
      
      // Reload all form values from localStorage
      const modelId = localStorage.getItem('generationPanel_modelId');
      const prompt = localStorage.getItem('generationPanel_prompt');
      const negativePrompt = localStorage.getItem('generationPanel_negativePrompt');
      const seed = localStorage.getItem('generationPanel_seed');
      const steps = localStorage.getItem('generationPanel_steps');
      const cfgScale = localStorage.getItem('generationPanel_cfgScale');
      const width = localStorage.getItem('generationPanel_width');
      const height = localStorage.getItem('generationPanel_height');
      const scheduler = localStorage.getItem('generationPanel_scheduler');
      const clipSkip = localStorage.getItem('generationPanel_clipSkip');
      const quantity = localStorage.getItem('generationPanel_quantity');
      const loras = localStorage.getItem('generationPanel_loras');
      
      // Update form values
      if (modelId) form.setValue('modelId', JSON.parse(modelId));
      if (prompt) form.setValue('prompt', JSON.parse(prompt));
      if (negativePrompt) form.setValue('negativePrompt', JSON.parse(negativePrompt));
      if (seed) form.setValue('seed', JSON.parse(seed));
      if (steps) form.setValue('steps', JSON.parse(steps));
      if (cfgScale) form.setValue('cfgScale', JSON.parse(cfgScale));
      if (width) form.setValue('width', JSON.parse(width));
      if (height) form.setValue('height', JSON.parse(height));
      if (scheduler) form.setValue('scheduler', JSON.parse(scheduler));
      if (clipSkip) form.setValue('clipSkip', JSON.parse(clipSkip));
      if (quantity) form.setValue('quantity', JSON.parse(quantity));
      if (loras) form.setValue('loras', JSON.parse(loras));
      
      console.log('✅ Settings reloaded successfully!');
    };
    
    // Listen for custom event from sidebar/gallery
    window.addEventListener('generationDataUpdated', handleGenerationDataUpdate as EventListener);
    
    return () => {
      window.removeEventListener('generationDataUpdated', handleGenerationDataUpdate as EventListener);
    };
  }, [form]);

  // Restore character settings when character is loaded from localStorage or characters data loads
  useEffect(() => {
    if (selectedCharacter && characters.length > 0) {
      // Verify the saved character still exists in the database
      const characterExists = characters.find(c => c.id === selectedCharacter.id);
      if (characterExists) {
        // Re-apply character settings. Always force the character's model —
        // it should take precedence over any auto-selected default.
        if (selectedCharacter.baseModel) {
          form.setValue('modelId', selectedCharacter.baseModel);
          localStorage.setItem('generationPanel_modelId', JSON.stringify(selectedCharacter.baseModel));
        }

        // Re-apply character LoRAs using the fresh DB version of the character.
        // This ensures the LoRA is always set correctly even if localStorage was
        // cleared (e.g. by clearCorruptedLoRAs) or the character was updated.
        const freshLoras = characterExists.loras ?? [];
        if (freshLoras.length > 0) {
          const currentLoras = form.getValues('loras') ?? [];
          // Only override if the character's LoRAs aren't already present in the form
          const allPresent = freshLoras.every((l: { id: string }) =>
            currentLoras.some((cl: { id: string }) => cl.id === l.id)
          );
          if (!allPresent) {
            console.log(`🎭 Re-applying ${freshLoras.length} LoRA(s) from character "${characterExists.name}"`);
            form.setValue('loras', freshLoras);
            localStorage.setItem('generationPanel_loras', JSON.stringify(freshLoras));
          }
        }

        // Update the prompt with current age from localStorage if this character was just loaded
        const currentPrompt = form.getValues('prompt') || '';
        if (currentPrompt.includes(selectedCharacter.basePrompt)) {
          // Get current age from localStorage
          const storageKey = `character_age_${selectedCharacter.id}`;
          const storedAge = localStorage.getItem(storageKey);
          const currentAge = storedAge ? parseInt(storedAge) : (selectedCharacter.age || 20);
          
          // Check if prompt needs age update
          const agePattern = /\b\d{2}yo\b/g;
          const hasAge = agePattern.test(currentPrompt);
          
          if (hasAge) {
            // Replace existing age with current age
            const updatedPrompt = currentPrompt.replace(agePattern, `${currentAge}yo`);
            form.setValue('prompt', updatedPrompt);
          } else {
            // Add age if missing
            const promptParts = currentPrompt.split(',').map(part => part.trim());
            // Find where to insert age (after character base prompt)
            const basePromptIndex = promptParts.findIndex(part => 
              selectedCharacter.basePrompt.includes(part) || part.includes(selectedCharacter.basePrompt.split(',')[0])
            );
            if (basePromptIndex >= 0) {
              promptParts.splice(basePromptIndex + 1, 0, `${currentAge}yo`);
              const updatedPrompt = promptParts.join(', ');
              form.setValue('prompt', updatedPrompt);
            }
          }
        }
      } else {
        // Character no longer exists, clear the selection
        setSelectedCharacter(null);
        localStorage.removeItem('generationPanel_selectedCharacter');
        toast({
          title: "Character Removed",
          description: "The selected character no longer exists and has been cleared.",
          variant: "destructive",
        });
      }
    }
  }, [selectedCharacter, characters, form, toast]);

  // Load the seed offset checkbox state from localStorage
  useEffect(() => {
    const savedSeedOffset = localStorage.getItem('generationPanel_useFirstImageSeedOffset');
    if (savedSeedOffset) {
      setUseFirstImageSeedOffset(savedSeedOffset === 'true');
    }
  }, []);

  // Save seed offset to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('generationPanel_useFirstImageSeedOffset', useFirstImageSeedOffset.toString());
  }, [useFirstImageSeedOffset]);

  // Restore scene settings when scene is loaded from localStorage or savedScenes data loads
  useEffect(() => {
    if (selectedScene && savedScenes.length > 0) {
      // Verify the saved scene still exists in the database
      const sceneExists = savedScenes.find(s => s.id === selectedScene.id);
      if (!sceneExists) {
        // Scene no longer exists, clear the selection
        setSelectedScene(null);
        localStorage.removeItem('generationPanel_selectedScene');
        toast({
          title: "Scene Removed",
          description: "The selected scene no longer exists and has been cleared.",
          variant: "destructive",
        });
      }
    }
  }, [selectedScene, savedScenes, toast]);

  // Handle character selection
  const handleCharacterSelect = (character: Character) => {
    setSelectedCharacter(character);
    // Persist character selection to localStorage
    localStorage.setItem('generationPanel_selectedCharacter', JSON.stringify(character));
    setShowCharacterSearch(false);
    setCharacterSearchTerm('');
    
    // Auto-populate prompt fields with character data
    // Character should come after quality terms, so we insert it strategically
    const currentPrompt = form.getValues('prompt') || '';
    let newPrompt;
    
    if (currentPrompt) {
      // Split current prompt into parts to identify quality terms vs other content
      const promptParts = currentPrompt.split(',').map(part => part.trim());
      const qualityIndicators = [
        'masterpiece', 'best quality', 'high quality', 'ultra detailed', 'detailed', 
        '8k', '4k', 'highest quality', 'score_9', 'score_8_up', 'score_7_up', 
        'score_6_up', 'absurdres', 'break'
      ];
      
      // Find where quality terms end
      let qualityEndIndex = 0;
      for (let i = 0; i < promptParts.length; i++) {
        const part = promptParts[i].toLowerCase();
        const isQuality = qualityIndicators.some(indicator => 
          part.includes(indicator.toLowerCase())
        );
        if (isQuality) {
          qualityEndIndex = i + 1;
        } else {
          break; // Stop at first non-quality term
        }
      }
      
      // Insert character after quality terms
      const qualityParts = promptParts.slice(0, qualityEndIndex);
      const otherParts = promptParts.slice(qualityEndIndex);
      
      // Remove any existing character prompt to avoid duplication
      const filteredOtherParts = otherParts.filter(part => 
        !part.toLowerCase().includes('cyberpunk') && 
        !part.toLowerCase().includes('hacker') &&
        !character.basePrompt.toLowerCase().includes(part.toLowerCase())
      );
      
      // Build character prompt with age if available
      // Check localStorage for user's current age setting first
      const storageKey = `character_age_${character.id}`;
      const storedAge = localStorage.getItem(storageKey);
      const currentAge = storedAge ? parseInt(storedAge) : (character.age || 25);
      
      let characterPrompt = character.basePrompt;
      characterPrompt += `, ${currentAge}yo`;
      
      if (qualityParts.length > 0) {
        newPrompt = [...qualityParts, characterPrompt + ', BREAK,', ...filteredOtherParts]
          .filter(part => part.length > 0)
          .join(', ');
      } else {
        newPrompt = [characterPrompt + ', BREAK,', ...filteredOtherParts]
          .filter(part => part.length > 0)
          .join(', ');
      }
    } else {
      // Build character prompt with age if available
      // Check localStorage for user's current age setting first
      const storageKey = `character_age_${character.id}`;
      const storedAge = localStorage.getItem(storageKey);
      const currentAge = storedAge ? parseInt(storedAge) : (character.age || 25);
      
      let characterPrompt = character.basePrompt;
      characterPrompt += `, ${currentAge}yo`;
      newPrompt = characterPrompt + ', BREAK,';
    }
    
    form.setValue('prompt', newPrompt);
    
    if (character.negativePrompt) {
      const currentNegative = form.getValues('negativePrompt') || '';
      const newNegative = character.negativePrompt + (currentNegative ? `, ${currentNegative}` : '');
      form.setValue('negativePrompt', newNegative);
    }
    
    // Apply character generation settings if available
    if (character.baseModel) {
      form.setValue('modelId', character.baseModel);
    }
    if (character.steps) {
      form.setValue('steps', character.steps);
    }
    if (character.cfgScale) {
      form.setValue('cfgScale', character.cfgScale / 10); // Convert from integer storage
    }
    if (character.seed) {
      form.setValue('seed', character.seed);
    }
    // Note: character doesn't have seedIncrement, so we keep the current form value
    if (character.loras && character.loras.length > 0) {
      form.setValue('loras', character.loras);
    }
    
    toast({
      title: "Character Selected",
      description: `${character.name} is now your active character. Settings will persist until you select a different character.`,
    });
  };

  // Clear selected character
  const handleCharacterClear = () => {
    if (selectedCharacter) {
      // Remove character-specific text from prompt
      const currentPrompt = form.getValues('prompt') || '';
      let cleanedPrompt = currentPrompt;
      
      // Remove character's base prompt text if present
      if (selectedCharacter.basePrompt) {
        const characterText = selectedCharacter.basePrompt.trim();
        cleanedPrompt = cleanedPrompt
          .split(',')
          .map(part => part.trim())
          .filter(part => part !== characterText)
          .join(', ')
          .replace(/,\s*,/g, ',') // Remove double commas
          .replace(/^,\s*/, '') // Remove leading comma
          .replace(/,\s*$/, ''); // Remove trailing comma
      }
      
      // Remove character's negative prompt text if present
      if (selectedCharacter.negativePrompt) {
        const currentNegative = form.getValues('negativePrompt') || '';
        const characterNegativeText = selectedCharacter.negativePrompt.trim();
        const cleanedNegative = currentNegative
          .split(',')
          .map(part => part.trim())
          .filter(part => part !== characterNegativeText)
          .join(', ')
          .replace(/,\s*,/g, ',')
          .replace(/^,\s*/, '')
          .replace(/,\s*$/, '');
        
        form.setValue('negativePrompt', cleanedNegative);
      }
      
      form.setValue('prompt', cleanedPrompt);
    }
    
    setSelectedCharacter(null);
    localStorage.removeItem('generationPanel_selectedCharacter');
    toast({
      title: "Character Cleared",
      description: "Character selection and related text have been removed from prompts.",
    });
  };

  // Handle saved scene selection
  const handleSceneSelect = (scene: SavedScene) => {
    // Check if we came from Easy Mode - if so, don't add scene text (it's already in the prompt)
    const fromEasyMode = localStorage.getItem('generationPanel_fromEasyMode') === 'true';
    
    if (fromEasyMode) {
      // Clear the flag so future manual selections work normally
      localStorage.removeItem('generationPanel_fromEasyMode');
      
      setSelectedScene(scene);
      localStorage.setItem('generationPanel_selectedScene', JSON.stringify(scene));
      
      toast({
        title: "Scene Selected",
        description: `Selected scene: "${scene.title}" (already included in prompt)`,
      });
    } else {
      // First, remove the previous scene's prompt if one exists
      let currentPrompt = form.getValues('prompt') || '';
      
      if (selectedScene) {
        // Remove previous scene's prompt text
        const previousScenePrompt = selectedScene.prompt.trim();
        const sceneParts = previousScenePrompt.split(',').map(part => part.trim());
        
        sceneParts.forEach(scenePart => {
          if (scenePart) {
            currentPrompt = currentPrompt
              .split(',')
              .map(part => part.trim())
              .filter(part => part !== scenePart)
              .join(', ');
          }
        });
        
        // Clean up formatting
        currentPrompt = currentPrompt
          .replace(/,\s*,/g, ',')
          .replace(/^,\s*/, '')
          .replace(/,\s*$/, '')
          .replace(/\s*,\s*BREAK2\s*/g, '')
          .trim();
      }
      
      // Now add the new scene
      let newPrompt;
      
      if (currentPrompt) {
        // Append scene after existing prompt with BREAK2 separator
        newPrompt = currentPrompt + ', ' + scene.prompt + ', BREAK2';
      } else {
        // If no existing prompt, use scene with BREAK2
        newPrompt = scene.prompt + ', BREAK2';
      }
      
      form.setValue('prompt', newPrompt);
      
      setSelectedScene(scene);
      localStorage.setItem('generationPanel_selectedScene', JSON.stringify(scene));
      
      toast({
        title: "Scene Applied",
        description: `Applied scene: "${scene.title}"`,
      });
    }
  };

  const handleSceneClear = () => {
    if (selectedScene) {
      // Remove scene-specific text from prompt
      const currentPrompt = form.getValues('prompt') || '';
      const scenePromptText = selectedScene.prompt.trim();
      
      // If the current prompt exactly matches the scene prompt, clear it to default
      if (currentPrompt === scenePromptText) {
        const defaultPrompt = 'masterpiece, best quality, 1girl, portrait, beautiful detailed eyes, long flowing hair, fantasy background, soft lighting, highly detailed';
        form.setValue('prompt', defaultPrompt);
      } else {
        // Try to remove scene-specific parts intelligently
        // Split scene prompt into parts and remove those from current prompt
        const sceneParts = scenePromptText.split(',').map(part => part.trim());
        let cleanedPrompt = currentPrompt;
        
        sceneParts.forEach(scenePart => {
          if (scenePart) {
            cleanedPrompt = cleanedPrompt
              .split(',')
              .map(part => part.trim())
              .filter(part => part !== scenePart)
              .join(', ');
          }
        });
        
        // Clean up formatting
        cleanedPrompt = cleanedPrompt
          .replace(/,\s*,/g, ',')
          .replace(/^,\s*/, '')
          .replace(/,\s*$/, '');
        
        // If prompt becomes empty, restore default
        if (!cleanedPrompt.trim()) {
          cleanedPrompt = 'masterpiece, best quality, 1girl, portrait, beautiful detailed eyes, long flowing hair, fantasy background, soft lighting, highly detailed';
        }
        
        form.setValue('prompt', cleanedPrompt);
      }
    }
    
    setSelectedScene(null);
    // Clear scene from localStorage and Easy Mode flag
    localStorage.removeItem('generationPanel_selectedScene');
    localStorage.removeItem('generationPanel_fromEasyMode');
    
    toast({
      title: "Scene Cleared",
      description: "Scene selection and related text have been removed from prompt.",
    });
  };

  // Handle event selection
  const handleEventSelect = async (event: Event) => {
    setSelectedEvent(event);
    // Persist event selection to localStorage
    localStorage.setItem('generationPanel_selectedEvent', JSON.stringify(event));
    
    // Fetch step count for billing warning
    try {
      const stepsResponse = await apiRequest("GET", `/api/events/${event.id}/steps`);
      const steps = await stepsResponse.json() as any[];
      setSelectedEventStepCount(steps?.length || 0);
    } catch (error) {
      setSelectedEventStepCount(0);
    }
    
    toast({
      title: "Event Selected",
      description: `Event "${event.title}" will be processed step-by-step during generation`,
    });
  };

  const handleEventClear = () => {
    if (selectedEvent) {
      setSelectedEvent(null);
      setSelectedEventStepCount(0);
      localStorage.removeItem('generationPanel_selectedEvent');
      toast({
        title: "Event Cleared",
        description: "Event selection has been cleared.",
      });
    }
  };



  // Handle clear prompt
  const handleClearPrompt = () => {
    form.setValue('prompt', '');
    setSelectedTags(new Set()); // Clear selected tags visual state
    
    toast({
      title: "Prompt Cleared",
      description: "Prompt has been completely cleared.",
    });
  };

  // Quick tags state cluster (state + persistence effect + tag handlers) moved
  // verbatim into useQuickTags. It replaces the exact same contiguous run of
  // hooks (4x useState + 1x useEffect), so hook call order is unchanged.
  const {
    quickTags,
    isEditingTags,
    setIsEditingTags,
    newTagText,
    setNewTagText,
    selectedTags,
    setSelectedTags,
    handleAddTag,
    handleAddNewTag,
    handleDeleteTag,
    handleResetTags,
  } = useQuickTags(form, toast);

  // AI Prompt Enhancement
  const [shotStyle, setShotStyle] = useState<'best' | 'candid'>('best');
  const [enhanceDirection, setEnhanceDirection] = useState('');

  // Reactively compute model family + prompt style label from the currently selected model.
  const watchedModelId = form.watch('modelId');
  const { selectedModelFamily, selectedModelName, selectedModelBaseModel, promptStyleInfo } = useMemo(() => {
    const model = allModels.find((m: Model) => m.id === watchedModelId);
    const family = detectModelFamily(model?.baseModel, model?.name);
    const name = model?.name ?? '';
    // baseModel is the canonical field used by server-side routing (e.g. "KREA 2" vs "Krea 2 Turbo").
    // The UI uses the same field so FAL/comfy path detection is consistent with the server.
    const baseModelStr = model?.baseModel ?? '';
    let style;
    if (family === 'flux' || family === 'krea2') {
      style = {
        label: 'Natural language',
        tooltip: 'This model uses flowing natural-language prose prompts, not tag lists.',
        colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      };
    } else {
      style = {
        label: 'Pony style',
        tooltip: 'This model uses booru/danbooru-style comma-separated tag prompts.',
        colorClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      };
    }
    return { selectedModelFamily: family, selectedModelName: name, selectedModelBaseModel: baseModelStr, promptStyleInfo: style };
  }, [watchedModelId, allModels]);
  const aiEnhanceMutation = useMutation({
    mutationFn: async (request: any) => {
      console.log('📤 Sending AI enhancement request:', request);
      
      try {
        const response = await apiRequest('POST', '/api/ai-enhance-prompt', request);
        console.log('📥 Response received:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ API Error:', errorText);
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ AI Enhancement result:', result);
        return result;
      } catch (networkError) {
        console.error('❌ Network error:', networkError);
        throw networkError;
      }
    },
    onSuccess: (result: { enhancedPrompt: string; negativePrompt: string; explanation: string }) => {
      console.log('🎉 AI Enhancement successful:', result);
      
      // Store the result to show in dialog
      setAiEnhancementResult(result);
      setIsAIEnhancing(false);
    },
    onError: (error: any) => {
      console.error('❌ AI Enhancement mutation failed:', error);
      toast({
        title: 'AI Enhancement Failed',
        description: error.message || 'Failed to enhance prompt. Please try again.',
        variant: 'destructive',
        duration: 4000,
      });
    },
  });

  const handleAIEnhance = async () => {
    setIsAIEnhancing(true);
    
    try {
      // Clear any corrupted localStorage that might cause JSON parsing issues
      console.log('🧹 Clearing potentially corrupted localStorage...');
      const clearKeys = ['generationPanel_selectedCharacter', 'generationPanel_selectedScene', 'customQualityWords'];
      clearKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (value && (value.trim() === '' || value === 'undefined' || value === 'null' || value.startsWith('{'))) {
            localStorage.removeItem(key);
            console.log(`Cleared localStorage key: ${key}`);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      });
      
      // Collect current form data
      const currentPrompt = form.getValues('prompt') || '';
      
      // Resolve the selected model's baseModel so the enhancer can pick the
      // right prompt style (Pony tag-list vs Krea2/Flux natural language).
      const modelId = form.getValues('modelId');
      const selectedModel = allModels.find((m: Model) => m.id === modelId);

      // Simple request with just the current prompt - no complex data
      const request = {
        currentPrompt,
        contentRating: 'explicit' as const,
        shotStyle,
        enhanceDirection: enhanceDirection.trim() || undefined,
        baseModel: selectedModel?.baseModel || undefined,
        modelName: selectedModel?.name || undefined,
      };
      
      console.log('🤖 Enhancing prompt with AI (simplified)...', { 
        currentPrompt: currentPrompt.substring(0, 50) + '...'
      });
      
      await aiEnhanceMutation.mutateAsync(request);
    } catch (error) {
      console.error('AI Enhancement error:', error);
      toast({
        title: 'AI Enhancement Failed',
        description: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setIsAIEnhancing(false);
    }
  };

  // Handle AI enhancement acceptance/rejection
  const handleAcceptAIEnhancement = () => {
    if (!aiEnhancementResult) return;
    
    // Update the form with enhanced prompt
    form.setValue('prompt', aiEnhancementResult.enhancedPrompt);
    
    // Update negative prompt if provided
    if (aiEnhancementResult.negativePrompt) {
      form.setValue('negativePrompt', aiEnhancementResult.negativePrompt);
    }
    
    // Close dialog and show success message
    setAiEnhancementResult(null);
    toast({
      title: '✨ AI Enhanced!',
      description: aiEnhancementResult.explanation,
      duration: 4000,
    });
  };

  const handleRejectAIEnhancement = () => {
    setAiEnhancementResult(null);
    toast({
      title: 'Enhancement Cancelled',
      description: 'Your original prompt remains unchanged.',
      duration: 2000,
    });
  };

  // Handle load prompt from saved prompts
  const handleLoadPrompt = (savedPrompt: SavedPrompt) => {
    form.setValue('prompt', savedPrompt.prompt);
    
    if (savedPrompt.negativePrompt) {
      form.setValue('negativePrompt', savedPrompt.negativePrompt);
    }

    // If the saved prompt has character and scene information, update selections
    if (savedPrompt.characterName && characters.length > 0) {
      const character = characters.find(c => c.name === savedPrompt.characterName);
      if (character) {
        setSelectedCharacter(character);
        localStorage.setItem('generationPanel_selectedCharacter', JSON.stringify(character));
      }
    }

    if (savedPrompt.sceneName && savedScenes.length > 0) {
      const scene = savedScenes.find(s => s.title === savedPrompt.sceneName);
      if (scene) {
        setSelectedScene(scene);
        localStorage.setItem('generationPanel_selectedScene', JSON.stringify(scene));
      }
    }
    
    toast({
      title: "Prompt Loaded",
      description: `Loaded: "${savedPrompt.title}"${savedPrompt.characterName ? ` with character: ${savedPrompt.characterName}` : ''}${savedPrompt.sceneName ? ` and scene: ${savedPrompt.sceneName}` : ''}`,
    });
  };

  // Handle save prompt
  const savePromptMutation = useMutation({
    mutationFn: async (data: { title: string; prompt: string; negativePrompt?: string; characterName?: string; sceneName?: string }) => {
      const response = await apiRequest('POST', '/api/saved-prompts', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-prompts'] });
      toast({
        title: "Prompt Saved",
        description: "Your prompt has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save prompt.",
        variant: "destructive",
      });
    },
  });

  const handleSavePrompt = () => {
    const currentPrompt = form.getValues('prompt');
    const currentNegativePrompt = form.getValues('negativePrompt');
    
    if (!currentPrompt?.trim()) {
      toast({
        title: "Nothing to Save",
        description: "Please enter a prompt before saving.",
        variant: "destructive",
      });
      return;
    }

    // Generate title from character and scene names
    let title = '';
    
    if (selectedCharacter && selectedScene) {
      title = `${selectedCharacter.name} - ${selectedScene.title}`;
    } else if (selectedCharacter) {
      title = `${selectedCharacter.name} Prompt`;
    } else if (selectedScene) {
      title = `${selectedScene.title} Prompt`;
    } else {
      // Generate title from first few words of prompt
      const promptWords = currentPrompt.split(',')[0].trim();
      title = promptWords.length > 30 ? `${promptWords.substring(0, 30)}...` : promptWords;
    }

    savePromptMutation.mutate({
      title,
      prompt: currentPrompt,
      negativePrompt: currentNegativePrompt || undefined,
      characterName: selectedCharacter?.name || undefined,
      sceneName: selectedScene?.title || undefined,
    });
  };

  // Filter characters for search
  const filteredCharacters = characters.filter(character =>
    character.name.toLowerCase().includes(characterSearchTerm.toLowerCase()) ||
    character.description?.toLowerCase().includes(characterSearchTerm.toLowerCase()) ||
    character.tags?.some((tag: string) => tag.toLowerCase().includes(characterSearchTerm.toLowerCase()))
  );

  const generateMutation = useMutation({
    mutationFn: async (data: GenerationFormData) => {
      
      try {
        const response = await apiRequest('POST', '/api/generations', data);
        console.log('✅ FRONTEND DEBUG: API request successful, response status:', response.status);
        const result = await response.json();
        console.log('✅ FRONTEND DEBUG: Parsed response:', result);
        return result;
      } catch (error) {
        console.error('❌ FRONTEND DEBUG: API request failed:', error);
        throw error;
      }
    },
    onSuccess: (generation: Generation) => {
      // Use the generation ID as the batch ID for tracking multiple images from the same request
      const batchId = generation.id;
      const orderedImages = Number(form.getValues('quantity')) || 1;
      
      // Add to active generations (preserve existing ones if in batch mode)
      setActiveGenerations(prev => {
        const updated = new Map(prev); // Keep existing generations for batch automation
        // Start at 10% to indicate API call succeeded and we're waiting for images
        // Include startTime for time-based progress calculation (FipFap approach)
        updated.set(batchId, { 
          generation, 
          progress: 10, 
          orderedImages, 
          returnedImages: 0,
          startTime: Date.now(),
          isCompleted: false
        });
        saveActiveGenerationsToStorage(updated);
        console.log(`✅ Added generation ${batchId} to tracking. Total active: ${updated.size}`);
        return updated;
      });
      
      setCurrentGeneration(generation); // Keep for backward compatibility with progress display
      setProgress(10); // Start at 10% to show API call succeeded
      
      // Add placeholder cards with spinners to show images are being generated
      setPendingImagePlaceholders(prev => {
        const updated = new Map(prev);
        updated.set(batchId, {
          batchId,
          count: orderedImages,
          readyCount: 0, // None ready yet
          startTime: Date.now(),
          prompt: generation.prompt?.substring(0, 50) || 'Generating...'
        });
        console.log(`📦 Added ${orderedImages} placeholder(s) for batch ${batchId}`);
        return updated;
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/generations'] });
      // NOTE: Do NOT invalidate /api/generations/recent here - it causes a race condition
      // where the background refetch overwrites WebSocket optimistic updates.
      // Images will be added via WebSocket setQueryData when they're ready.
      // High-intent moment: the user just kicked off a 2-3 minute wait. Offer
      // push notifications (native permission prompt) so they can leave the tab.
      // Only attempt once per browser unless they granted permission.
      try {
        if (pushSupported() && localStorage.getItem('pushPromptAttempted') !== 'true') {
          localStorage.setItem('pushPromptAttempted', 'true');
          enablePushNotifications().then((enabled) => {
            if (enabled) {
              toast({
                title: 'Notifications on',
                description: "We'll ping you when your images are ready — feel free to browse the feed while you wait.",
              });
            }
          });
        } else if (pushSupported() && Notification.permission === 'granted') {
          // Keep the subscription fresh (endpoints rotate)
          enablePushNotifications();
        }
      } catch {
        // localStorage unavailable — skip push setup
      }

      toast({
        title: "Generation Started",
        description: `Your ${orderedImages} image${orderedImages > 1 ? 's are' : ' is'} being generated. You can start another generation while this one processes.`,
        duration: 3000,
      });
      
      // Reset the button state immediately after successful submission
      // The form stays ready for the next generation
    },
    onError: (error: any) => {
      console.error("❌ FRONTEND DEBUG: Enhanced error details:", error);
      let errorMessage = "Failed to start generation";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.errors && Array.isArray(error.errors)) {
        errorMessage = error.errors.map((e: any) => e.message).join(", ");
      }

      // apiRequest throws errors shaped like `400: {"message":"..."}`. Pull the
      // human-readable message out of that JSON body so the toast shows a clean
      // sentence (e.g. the LoRA-failed message) instead of raw JSON.
      try {
        const jsonPart = errorMessage.replace(/^\d+:\s*/, '');
        const parsed = JSON.parse(jsonPart);
        if (parsed?.message) {
          errorMessage = parsed.message;
        }
      } catch {
        // Not JSON — leave errorMessage as-is.
      }
      
      // Enhanced error messages for API key issues
      if (errorMessage.includes('Invalid CivitAI API key')) {
        errorMessage = 'Your CivitAI API key appears to be invalid. Please update it in Settings, or remove it to use the platform API key (12 credits per image).';
      } else if (errorMessage.includes('Insufficient CivitAI credits')) {
        errorMessage = 'Your CivitAI account has insufficient credits. Please add credits to your CivitAI account, or remove your API key to use the platform API key (12 credits per image).';
      } else if (errorMessage.includes('rate limit')) {
        errorMessage = 'CivitAI API rate limit exceeded. Please wait a moment before trying again or use the platform API key.';
      }
      
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const refreshModelsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/models/refresh', {});
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      toast({
        title: "Models Refreshed",
        description: `Successfully loaded ${data.count} models from CivitAI`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh models",
        variant: "destructive",
      });
    },
  });


  // Handle WebSocket messages - FipFap approach: ignore intermediate progress, use time-based calculation
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'generation_update' && lastMessage.generationId) {
        // CRITICAL: Check if this generation was deleted - if so, ignore ALL updates
        if (isGenerationDeleted(lastMessage.generationId)) {
          console.log(`🚫 Ignoring generation_update for DELETED generation: ${lastMessage.generationId}`);
          return;
        }
        
        // MOBILE FIX: Use WebSocket progress values (Safari throttles setInterval)
        const batchId = lastMessage.generationId!;
        const wsProgress = typeof lastMessage.progress === 'number' ? lastMessage.progress : 0;
        
        console.log(`📨 WebSocket progress update for batch ${batchId}: ${wsProgress}%`);
        
        if (lastMessage.status === 'failed') {
          // Dead-output / content-filter failure sent by the batch poller
          console.log(`❌ generation_update failed for ${batchId}`);
          setActiveGenerations(prev => {
            const updated = new Map(prev);
            updated.delete(batchId);
            saveActiveGenerationsToStorage(updated);
            return updated;
          });
          setPendingImagePlaceholders(prev => {
            const updated = new Map(prev);
            updated.delete(batchId);
            return updated;
          });
          if (currentGeneration && currentGeneration.id === batchId) {
            setCurrentGeneration(null);
            setProgress(0);
          }
          const failMsg = (lastMessage as any).message as string | undefined;
          toast({
            title: "Generation Failed",
            description: failMsg || "CivitAI didn't return an image. Try adjusting your prompt and generate again.",
            variant: "destructive",
          });
        } else if (wsProgress === 100 || lastMessage.status === 'completed') {
          setActiveGenerations(prev => {
            const updated = new Map(prev);
            const existing = updated.get(batchId);
            if (existing) {
              const updatedGeneration = { 
                ...existing, 
                progress: 100, 
                isCompleted: true,
                completionStartTime: existing.completionStartTime || Date.now()
              };
              updated.set(batchId, updatedGeneration);
              saveActiveGenerationsToStorage(updated);
            }
            return updated;
          });
        } else if (wsProgress > 0) {
          // Update progress from WebSocket (primary source for mobile compatibility)
          setActiveGenerations(prev => {
            const updated = new Map(prev);
            const existing = updated.get(batchId);
            if (existing && !existing.isCompleted) {
              // Only update if WebSocket progress is higher (prevents backwards progress)
              const newProgress = Math.max(existing.progress, wsProgress);
              const newStatusMessage = (lastMessage as any).statusMessage as string | undefined;
              const statusChanged = newStatusMessage !== existing.statusMessage;
              if (newProgress !== existing.progress || statusChanged) {
                updated.set(batchId, { ...existing, progress: newProgress, statusMessage: newStatusMessage });
                saveActiveGenerationsToStorage(updated);
                console.log(`📊 WebSocket progress update: ${batchId} now at ${newProgress}%${newStatusMessage ? ` — ${newStatusMessage}` : ''}`);
              }
            }
            return updated;
          });
        }
      } else if (lastMessage.type === 'generation_image_ready' && (lastMessage.batchId || lastMessage.generationId)) {
        // Individual image is ready - increment returned image count and recalculate time-based progress
        const batchId = lastMessage.batchId || lastMessage.generationId!;
        const imageId = lastMessage.imageId || lastMessage.generationId;
        
        // CRITICAL: Check if this generation/image was deleted - if so, ignore
        if (isGenerationDeleted(batchId) || (imageId && isGenerationDeleted(imageId))) {
          console.log(`🚫 Ignoring generation_image_ready for DELETED generation: batch=${batchId}, image=${imageId}`);
          return;
        }
        
        console.log(`🖼️ Individual image ready - batch: ${batchId}, image: ${imageId}`);
        
        // Find the batch and increment image count with time-based progress
        setActiveGenerations(prev => {
          const updated = new Map(prev);
          const batchData = updated.get(batchId);
          
          if (batchData) {
            const newCompletedImages = batchData.returnedImages + 1;
            const isAllComplete = newCompletedImages >= batchData.orderedImages;
            const newProgress = isAllComplete ? 100 : computeProgress(batchData.startTime, newCompletedImages, batchData.orderedImages);
            
            const updatedBatch = { 
              ...batchData, 
              returnedImages: newCompletedImages,
              progress: newProgress,
              isCompleted: isAllComplete,
              completionStartTime: isAllComplete && !batchData.completionStartTime ? Date.now() : batchData.completionStartTime
            };
            updated.set(batchId, updatedBatch);
            saveActiveGenerationsToStorage(updated);
            console.log(`📷 Image ready for batch ${batchId}: ${newCompletedImages}/${batchData.orderedImages} (${Math.round(newProgress)}%)`);
          } else {
            console.log(`⚠️ Ignoring generation_image_ready for unknown batch: ${batchId}`);
          }
          
          return updated;
        });
        
        // Mark one placeholder as "ready" (turns green) - stays visible until image renders
        setPendingImagePlaceholders(prev => {
          const updated = new Map(prev);
          const existing = updated.get(batchId);
          console.log(`📦 Looking for placeholder with batchId: ${batchId}, found: ${existing ? 'yes' : 'no'}, current keys:`, Array.from(updated.keys()));
          if (existing) {
            const newReadyCount = Math.min(existing.readyCount + 1, existing.count);
            updated.set(batchId, { ...existing, readyCount: newReadyCount });
            console.log(`📦 Placeholder ready for batch ${batchId}: ${newReadyCount}/${existing.count} ready (green)`);
          } else {
            console.log(`⚠️ No placeholder found for batchId: ${batchId}`);
          }
          return updated;
        });
        
        // Remove one placeholder after 30 seconds to allow image to fully render
        setTimeout(() => {
          setPendingImagePlaceholders(prev => {
            const updated = new Map(prev);
            const existing = updated.get(batchId);
            if (existing) {
              const newCount = existing.count - 1;
              const newReadyCount = Math.max(0, existing.readyCount - 1);
              if (newCount <= 0) {
                updated.delete(batchId);
                console.log(`📦 Removed all placeholders for batch ${batchId}`);
              } else {
                updated.set(batchId, { ...existing, count: newCount, readyCount: newReadyCount });
                console.log(`📦 Placeholder removed for batch ${batchId}: ${newCount} remaining`);
              }
            }
            return updated;
          });
        }, 30000); // 30 second delay to let image fully render
        
        // FAST PATH: Insert image into cache immediately using data from the WebSocket
        // message itself, so it renders from the CDN URL with zero round-trips.
        // We then kick off a background invalidation to reconcile canonical metadata.
        if (imageId) {
          if (isGenerationDeleted(imageId)) {
            console.log(`🚫 Skipping optimistic insert for DELETED generation: ${imageId}`);
          } else {
            const wsImageUrl = (lastMessage as any).imageUrl as string | undefined;
            const sourceBatch = activeGenerations.get(batchId)?.generation as any | undefined;

            // Only do the optimistic insert when we have both the source batch
            // metadata (so the gallery card can render prompt/model/etc safely)
            // AND a CDN imageUrl from the WS message. Otherwise fall back to
            // the standard invalidation path so the gallery refetches the full,
            // canonical record from the server.
            if (sourceBatch && wsImageUrl) {
              queryClient.setQueryData<{ generations: Generation[]; hasMore: boolean; total: number }>(
                ['/api/generations/recent'],
                (old) => {
                  const optimistic: Generation = {
                    ...sourceBatch,
                    id: imageId,
                    batchId: imageId === batchId ? null : batchId,
                    imageUrl: wsImageUrl,
                    // Defensive defaults for fields the gallery renders with .slice / .map
                    prompt: sourceBatch.prompt ?? '',
                    negativePrompt: sourceBatch.negativePrompt ?? '',
                    loras: sourceBatch.loras ?? [],
                    status: 'completed',
                    createdAt: new Date(),
                  } as Generation;

                  if (!old) {
                    return { generations: [optimistic], hasMore: true, total: 1 };
                  }
                  if (old.generations.some(g => g.id === imageId)) {
                    return old;
                  }
                  return {
                    ...old,
                    generations: [optimistic, ...old.generations],
                    total: old.total + 1,
                  };
                }
              );
              console.log(`⚡ Optimistically inserted image ${imageId} into gallery cache from WS payload`);
              // Immediately refetch to sync canonical server data AND reset the
              // 30-second poll interval timer. The server has the DB record at this
              // point (WS is sent after DB write), so the refetch returns correct data.
              // This prevents the interval (set up at page-load time) from firing
              // mid-optimistic-insert and overwriting the cache with stale data.
              queryClient.refetchQueries({ queryKey: ['/api/generations/recent'] });
            } else {
              console.log(`ℹ️ No source batch metadata for ${batchId}; relying on invalidation refetch`);
              queryClient.refetchQueries({ queryKey: ['/api/generations/recent'] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/generations/processing'] });
          }
          
          // Show reward popup for individual image (FipFap-style)
          // iOS Safari throttles long setTimeout, so use multiple short steps
          // This ensures the delay actually happens even on iOS Safari
          const triggerPopupWithRetry = async () => {
            // Wait using multiple short intervals (iOS Safari friendly)
            for (let i = 0; i < 4; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Use requestAnimationFrame for the final trigger to ensure DOM is ready
            requestAnimationFrame(() => {
              showRewardPopupForGeneration(imageId);
            });
          };
          
          triggerPopupWithRetry();
        }
      } else if (lastMessage.type === 'generation_complete' && lastMessage.generationId) {
        // CRITICAL: Skip cache updates for deleted generations
        const wasDeleted = isGenerationDeleted(lastMessage.generationId);
        if (wasDeleted) {
          console.log(`🚫 Ignoring generation_complete for DELETED generation: ${lastMessage.generationId}`);
        }
        
        // Remove from active generations and clear storage
        setActiveGenerations(prev => {
          const updated = new Map(prev);
          updated.delete(lastMessage.generationId!);
          saveActiveGenerationsToStorage(updated);
          return updated;
        });
        
        // Clear current generation if it matches
        if (currentGeneration && lastMessage.generationId === currentGeneration.id) {
          setCurrentGeneration(null);
          setProgress(0);
        }
        
        // Also cleanup any remaining placeholders for this generation
        setPendingImagePlaceholders(prev => {
          const updated = new Map(prev);
          if (updated.has(lastMessage.generationId!)) {
            updated.delete(lastMessage.generationId!);
            console.log(`📦 Cleanup: Removed placeholders for completed generation ${lastMessage.generationId}`);
          }
          return updated;
        });
        
        // Only do cache operations and show toast if NOT deleted
        if (!wasDeleted) {
          // Check if cache has data - if not, we need to refetch (mobile fix)
          const existingData = queryClient.getQueryData<{ generations: Generation[]; hasMore: boolean; total: number }>(['/api/generations/recent']);
          if (!existingData || existingData.generations.length === 0) {
            console.log('📱 Generation complete but cache empty - triggering full refetch');
            queryClient.refetchQueries({ queryKey: ['/api/generations/recent'] });
          } else {
            console.log('✅ Generation complete - image already in cache from optimistic update');
          }
          toast({
            title: "Generation Complete!",
            description: "Your image has been generated successfully.",
          });
        }
      } else if (lastMessage.type === 'generation_batch_complete' && lastMessage.generationId) {
        // All images in batch are complete (or partial completion)
        const batchId = lastMessage.generationId!;
        const isPartial = (lastMessage as any).status === 'partial_complete';
        const totalImages = (lastMessage as any).totalImages;
        const message = (lastMessage as any).message;
        
        console.log(`🎉 BATCH COMPLETE WebSocket received for batch: ${batchId}`);
        console.log(`✅ Batch ${isPartial ? 'partially' : 'fully'} complete: ${totalImages} images total`);
        console.log('⏱️ Starting 3-second auto-close timer for batch:', batchId);
        
        // Auto-close progress screen after 3 seconds
        setTimeout(() => {
          console.log('🚀 AUTO-CLOSE TRIGGERED - Removing batch from activeGenerations:', batchId);
          // Remove from active generations and clear storage  
          setActiveGenerations(prev => {
            const updated = new Map(prev);
            const wasDeleted = updated.delete(batchId);
            console.log(`🗑️ Batch ${batchId} deletion result:`, wasDeleted);
            console.log(`📊 Remaining active generations:`, updated.size);
            saveActiveGenerationsToStorage(updated);
            return updated;
          });
          
          // Also remove any remaining placeholders for this batch (cleanup safety net)
          setPendingImagePlaceholders(prev => {
            const updated = new Map(prev);
            if (updated.has(batchId)) {
              updated.delete(batchId);
              console.log(`📦 Cleanup: Removed remaining placeholders for completed batch ${batchId}`);
            }
            return updated;
          });
          
          // Clear current generation if it matches
          if (currentGeneration && batchId === currentGeneration.id) {
            console.log('🧹 Clearing current generation state');
            setCurrentGeneration(null);
            setProgress(0);
          }
        }, 3000);
        
        // Check if cache has data - if not, we need to refetch (mobile fix)
        const existingData = queryClient.getQueryData<{ generations: Generation[]; hasMore: boolean; total: number }>(['/api/generations/recent']);
        if (!existingData || existingData.generations.length === 0) {
          console.log('📱 Batch complete but cache empty - triggering full refetch');
          queryClient.refetchQueries({ queryKey: ['/api/generations/recent'] });
        } else {
          console.log('✅ Batch complete - images preserved in cache from optimistic updates');
        }
        
        // Show appropriate notification for partial completion
        if (isPartial && message) {
          toast({
            title: "Partial Generation Complete",
            description: message,
            variant: "default",
          });
        }
        // Notification removed per user request for full completion
      } else if ((lastMessage as any).type === 'generation_warning' && lastMessage.generationId) {
        // Non-fatal warning from the server (e.g. unresolvable LoRAs on RunPod)
        const warningText = (lastMessage as any).warning as string | undefined;
        if (warningText) {
          toast({
            title: "Generation Warning",
            description: warningText,
            variant: "default",
          });
        }
      } else if ((lastMessage as any).type === 'generation_error' && lastMessage.generationId) {
        // Generation failed - clear progress and show error
        console.log(`❌ Generation error: ${lastMessage.generationId}`);
        
        // Remove from active generations and clear storage
        setActiveGenerations(prev => {
          const updated = new Map(prev);
          updated.delete(lastMessage.generationId!);
          saveActiveGenerationsToStorage(updated);
          return updated;
        });
        
        // Clear current generation if it matches
        if (currentGeneration && lastMessage.generationId === currentGeneration.id) {
          setCurrentGeneration(null);
          setProgress(0);
        }
        
        // Also cleanup any remaining placeholders for this failed generation
        setPendingImagePlaceholders(prev => {
          const updated = new Map(prev);
          if (updated.has(lastMessage.generationId!)) {
            updated.delete(lastMessage.generationId!);
            console.log(`📦 Cleanup: Removed placeholders for failed generation ${lastMessage.generationId}`);
          }
          return updated;
        });
        
        // Show error toast — use the server's actual error message when available
        const serverError = (lastMessage as any).error as string | undefined;
        toast({
          title: "Generation Failed",
          description: serverError || "Image generation encountered an error. Please check your settings and try again.",
          variant: "destructive",
        });
      }
    }
  }, [lastMessage, currentGeneration, form, toast]);

  // Removed aggressive polling - WebSocket and optimistic updates handle image delivery
  // Manual refresh is available if users want to sync with server

  // HTTP polling fallback for placeholder status (works when WebSocket is disconnected on mobile)
  useEffect(() => {
    if (pendingImagePlaceholders.size === 0) return;
    
    const pollPlaceholderStatus = async () => {
      // Use ref to always get latest state (avoids stale closure in interval)
      const currentPlaceholders = pendingPlaceholdersRef.current;
      if (currentPlaceholders.size === 0) return;
      
      for (const [batchId, placeholder] of currentPlaceholders.entries()) {
        try {
          // Fetch the generation status from server
          const response = await fetch(`/api/generations/${batchId}`);
          if (!response.ok) continue;
          
          const generation = await response.json();
          const completedImages = generation.images?.length || 0;
          
          // Update placeholder readyCount if server shows more completed images
          if (completedImages > placeholder.readyCount) {
            console.log(`📡 HTTP poll: batch ${batchId} has ${completedImages} images (was ${placeholder.readyCount})`);
            
            setPendingImagePlaceholders(prev => {
              const updated = new Map(prev);
              const existing = updated.get(batchId);
              if (existing && completedImages > existing.readyCount) {
                updated.set(batchId, { ...existing, readyCount: Math.min(completedImages, existing.count) });
              }
              return updated;
            });
            
            // Also update activeGenerations returnedImages count
            setActiveGenerations(prev => {
              const updated = new Map(prev);
              const batchData = updated.get(batchId);
              if (batchData && completedImages > batchData.returnedImages) {
                const isAllComplete = completedImages >= batchData.orderedImages;
                const newProgress = isAllComplete ? 100 : computeProgress(batchData.startTime, completedImages, batchData.orderedImages);
                updated.set(batchId, { 
                  ...batchData, 
                  returnedImages: completedImages,
                  progress: newProgress,
                  isCompleted: isAllComplete,
                  completionStartTime: isAllComplete && !batchData.completionStartTime ? Date.now() : batchData.completionStartTime
                });
                saveActiveGenerationsToStorage(updated);
              }
              return updated;
            });
          }
          
          // If generation is complete, remove placeholder and add images to cache
          if (generation.status === 'completed' && completedImages >= placeholder.count) {
            console.log(`📡 HTTP poll: batch ${batchId} is complete with ${completedImages} images`);
            
            // CRITICAL: Add completed generation to cache (WebSocket may have failed to deliver)
            // Check if already exists to avoid duplicates
            if (!isGenerationDeleted(batchId)) {
              queryClient.setQueryData<{ generations: Generation[]; hasMore: boolean; total: number }>(
                ['/api/generations/recent'],
                (old) => {
                  if (!old) return { generations: [generation], hasMore: true, total: 1 };
                  const exists = old.generations.some(g => g.id === generation.id);
                  if (exists) return old;
                  return {
                    ...old,
                    generations: [generation, ...old.generations],
                    total: old.total + 1
                  };
                }
              );
              console.log(`✨ HTTP poll: added completed generation ${batchId} to gallery cache`);
            }
            
            // Remove from active generations
            setActiveGenerations(prev => {
              const updated = new Map(prev);
              updated.delete(batchId);
              saveActiveGenerationsToStorage(updated);
              return updated;
            });
            
            // Remove placeholder
            setPendingImagePlaceholders(prev => {
              const updated = new Map(prev);
              updated.delete(batchId);
              return updated;
            });
          }
        } catch (error) {
          console.log(`📡 HTTP poll error for batch ${batchId}:`, error);
        }
      }
    };
    
    // Poll every 15 seconds as backup when WebSocket misses updates
    const pollInterval = setInterval(pollPlaceholderStatus, 15000);
    
    // Also run immediately on mount
    pollPlaceholderStatus();
    
    return () => clearInterval(pollInterval);
  }, [pendingImagePlaceholders.size, computeProgress]);
  
  // Time-based progress update interval (FipFap approach - more reliable than WebSocket)
  useEffect(() => {
    if (activeGenerations.size === 0) return;
    
    const maxGenerationTime = 8 * 60 * 1000; // 8 minute hard cap
    const progressInterval = setInterval(() => {
      setActiveGenerations(prev => {
        const updated = new Map(prev);
        let hasChanges = false;
        
        for (const [batchId, data] of updated.entries()) {
          if (!data.isCompleted) {
            // Hard cap: stop tracking after 8 minutes
            const elapsed = Date.now() - data.startTime;
            if (elapsed > maxGenerationTime) {
              console.log(`⏰ Hard cap reached for ${batchId} - removing from tracking`);
              updated.delete(batchId);
              hasChanges = true;
              continue;
            }
            
            const newProgress = computeProgress(data.startTime, data.returnedImages, data.orderedImages);
            if (Math.abs(newProgress - data.progress) > 1) { // Only update if meaningful change (>1%)
              updated.set(batchId, { ...data, progress: newProgress });
              hasChanges = true;
            }
          }
        }
        
        if (hasChanges) {
          saveActiveGenerationsToStorage(updated);
        }
        return hasChanges ? updated : prev;
      });
    }, 3000); // Update every 3 seconds (reduced from 1s to save compute)
    
    return () => clearInterval(progressInterval);
  }, [activeGenerations.size, computeProgress]);

  // THIRD BACKUP: Remove placeholders when images appear in the cache (regardless of API provider)
  // This catches cases where WebSocket fails and HTTP polling misses timing
  useEffect(() => {
    if (pendingImagePlaceholders.size === 0 || generations.length === 0) return;
    
    const placeholdersToRemove: string[] = [];
    
    for (const [batchId, placeholder] of pendingImagePlaceholders) {
      // Only clear the placeholder card group once ALL images in the batch have
      // arrived. Previously this fired as soon as the first image landed in the
      // cache, which (now that we insert optimistically from the WebSocket) made
      // the entire row of "Generating..." boxes vanish after just one image —
      // leaving the user with no progress indicator for images 2..N.
      if (placeholder.readyCount < placeholder.count) {
        continue;
      }

      const matchingGen = generations.find(g => g.id === batchId);
      if (matchingGen && (matchingGen.imageUrl || matchingGen.storedImagePath)) {
        console.log(`🗑️ Cache sync: removing placeholder for ${batchId} - all ${placeholder.count} images ready`);
        placeholdersToRemove.push(batchId);
      }
    }
    
    if (placeholdersToRemove.length > 0) {
      setPendingImagePlaceholders(prev => {
        const updated = new Map(prev);
        placeholdersToRemove.forEach(id => updated.delete(id));
        return updated;
      });
      
      // Also clean up active generations
      setActiveGenerations(prev => {
        const updated = new Map(prev);
        let hasChanges = false;
        placeholdersToRemove.forEach(id => {
          if (updated.has(id)) {
            updated.delete(id);
            hasChanges = true;
          }
        });
        if (hasChanges) {
          saveActiveGenerationsToStorage(updated);
        }
        return hasChanges ? updated : prev;
      });
    }
  }, [generations, pendingImagePlaceholders]);

  // Frontend age sanitization function
  const sanitizePromptAges = (prompt: string): string => {
    let sanitized = prompt;
    
    // Replace any number under 18 + age indicator with "18 years old"
    // Enhanced pattern to catch "15y old", "16.6 yo", "17 years old", etc.
    sanitized = sanitized.replace(/(\d+(?:\.\d+)?)\s*(?:yo|y\.?o\.?|y\s+old|year|yr)s?(?:\s*old)?/gi, (match, numberStr) => {
      const age = parseFloat(numberStr);
      if (age > 0 && age < 18) {
        return '18 years old';
      }
      return match; // Keep original if 18 or over
    });
    
    // NEW: Handle indirect age references like "looks 13", "appears 15", "seems like she is 16"
    sanitized = sanitized.replace(/\b(?:looks?|appears?|seems?)\s+(?:like\s+(?:she\s+is\s+|he\s+is\s+|they\s+are\s+)?)?(\d+(?:\.\d+)?)\b/gi, (match, numberStr) => {
      const age = parseFloat(numberStr);
      if (age > 0 && age < 18) {
        return 'looks 18+';
      }
      return match;
    });
    
    // NEW: Handle "looks like she is X" or "appears to be X" variations
    sanitized = sanitized.replace(/\b(?:looks?|appears?|seems?)\s+(?:like\s+(?:she|he|they)\s+(?:is|are)\s+|to\s+be\s+)(\d+(?:\.\d+)?)/gi, (match, numberStr) => {
      const age = parseFloat(numberStr);
      if (age > 0 && age < 18) {
        return 'looks like an 18+ adult';
      }
      return match;
    });
    
    // Replace spelled-out ages under 18 with "eighteen"
    const ageReplacements: Record<string, string> = {
      'one': 'eighteen', 'two': 'eighteen', 'three': 'eighteen', 'four': 'eighteen',
      'five': 'eighteen', 'six': 'eighteen', 'seven': 'eighteen', 'eight': 'eighteen',
      'nine': 'eighteen', 'ten': 'eighteen', 'eleven': 'eighteen', 'twelve': 'eighteen',
      'thirteen': 'eighteen', 'fourteen': 'eighteen', 'fifteen': 'eighteen', 
      'sixteen': 'eighteen', 'seventeen': 'eighteen'
    };
    
    Object.entries(ageReplacements).forEach(([young, adult]) => {
      const regex = new RegExp(`\\b${young}\\s+(?:year|yr)s?(?:\\s*old)?\\b`, 'gi');
      sanitized = sanitized.replace(regex, `${adult} years old`);
      
      // NEW: Handle spelled-out indirect references like "looks thirteen" or "appears fifteen"
      const indirectRegex = new RegExp(`\\b(?:looks?|appears?|seems?)\\s+(?:like\\s+(?:she|he|they)\\s+(?:is|are)\\s+)?${young}\\b`, 'gi');
      sanitized = sanitized.replace(indirectRegex, 'looks 18+');
    });
    
    // Replace "young/underage" variations with "18+ adult"
    sanitized = sanitized.replace(/\b(?:young|little|small|tiny|minor|underage|teen|teenage)\s+(?:girl|girls|female|females|woman|women)\b/gi, '18+ adult women');
    
    // Replace "flat chested" variations with "small breasts" (handles space, hyphen, underscore)
    sanitized = sanitized.replace(/\bflat[_\- ]?chested\b/gi, 'small breasts');
    sanitized = sanitized.replace(/\bflat[_\- ]?chest\b/gi, 'small breasts');
    
    // Apply database positive prompt rules (from admin filters)
    // positive_replace: replace pattern with replacement
    // positive_remove: remove pattern entirely
    const positiveReplaceRules = sanitizationRules.filter(r => r.ruleType === 'positive_replace' && r.isEnabled);
    positiveReplaceRules.forEach(rule => {
      try {
        // Normalize pattern to handle space/hyphen/underscore interchangeably
        const normalizedPattern = rule.pattern.replace(/[_\- ]/g, '[_\\- ]?');
        const regex = new RegExp(`\\b${normalizedPattern}\\b`, 'gi');
        sanitized = sanitized.replace(regex, rule.replacement);
      } catch (e) {
        console.warn('Invalid sanitization rule pattern:', rule.pattern);
      }
    });
    
    // positive_remove: remove pattern entirely
    const positiveRemoveRules = sanitizationRules.filter(r => r.ruleType === 'positive_remove' && r.isEnabled);
    positiveRemoveRules.forEach(rule => {
      try {
        const normalizedPattern = rule.pattern.replace(/[_\- ]/g, '[_\\- ]?');
        const regex = new RegExp(`\\b${normalizedPattern}\\b,?\\s*`, 'gi');
        sanitized = sanitized.replace(regex, '');
      } catch (e) {
        console.warn('Invalid sanitization rule pattern:', rule.pattern);
      }
    });
    
    return sanitized;
  };

  // Frontend negative prompt safety injection
  const sanitizeNegativePrompt = (negativePrompt: string = ''): string => {
    // Check if 'salt' is in the negative prompt (bypass keyword)
    if (negativePrompt.toLowerCase().includes('salt')) {
      return negativePrompt;
    }
    
    // Check if safety terms are already present
    const lowerNegative = negativePrompt.toLowerCase();
    const hasChild = lowerNegative.includes('child');
    const hasCSAM = lowerNegative.includes('csam');
    
    let sanitized = negativePrompt.trim();
    
    // Add missing safety terms
    if (!hasChild || !hasCSAM) {
      const safetyTerms = [];
      if (!hasChild) safetyTerms.push('child');
      if (!hasCSAM) safetyTerms.push('CSAM');
      
      if (sanitized) {
        // Split by commas to insert safety terms discretely
        const parts = sanitized.split(',').map(part => part.trim()).filter(part => part.length > 0);
        
        // Insert safety terms around the middle (approximately 8 commas in)
        const insertPosition = Math.min(8, Math.floor(parts.length / 2));
        parts.splice(insertPosition, 0, ...safetyTerms);
        
        sanitized = parts.join(', ');
      } else {
        // If no existing negative prompt, just add safety terms
        sanitized = safetyTerms.join(', ');
      }
      
      console.log('🛡️ Frontend: Safety terms added to negative prompt');
    }
    
    // Apply database negative_add rules (from admin filters)
    // These ADD terms to the negative prompt if not already present
    const negativeAddRules = sanitizationRules.filter(r => r.ruleType === 'negative_add' && r.isEnabled);
    const lowerNegativeForDB = sanitized.toLowerCase();
    const termsToAdd: string[] = [];
    
    negativeAddRules.forEach(rule => {
      if (!lowerNegativeForDB.includes(rule.pattern.toLowerCase())) {
        termsToAdd.push(rule.pattern);
      }
    });
    
    if (termsToAdd.length > 0) {
      if (sanitized) {
        const parts = sanitized.split(',').map(p => p.trim()).filter(p => p.length > 0);
        const insertPosition = Math.min(8, Math.max(2, parts.length));
        termsToAdd.forEach((term, index) => {
          parts.splice(insertPosition + index, 0, term);
        });
        sanitized = parts.join(', ');
      } else {
        sanitized = termsToAdd.join(', ');
      }
      console.log('🛡️ Frontend: Added DB safety terms to negative prompt:', termsToAdd.join(', '));
    }
    
    return sanitized;
  };

  const onSubmit = async (data: GenerationFormData) => {
    console.log('🐛 Form submission data:', JSON.stringify(data, null, 2));
    console.log('🐛 Current form values:', JSON.stringify(form.getValues(), null, 2));
    
    // Get the current modelId from the form to double-check
    const currentModelId = form.getValues('modelId');
    console.log('🐛 Current modelId from form.getValues():', currentModelId);
    
    // If the data.modelId is empty but form has a value, use that instead
    if ((!data.modelId || data.modelId === '') && currentModelId && currentModelId !== '') {
      console.log('🔧 Using form modelId instead of submission data modelId');
      data.modelId = currentModelId;
    }
    
    // Validate that a model is selected before proceeding
    if (!data.modelId || data.modelId === '') {
      toast({
        title: "No Model Selected",
        description: "Please select a model before generating images. Check the advanced settings if needed.",
        variant: "destructive"
      });
      return;
    }
    
    // FRONTEND SANITIZATION: Clean the prompt before validation/display
    const originalPrompt = data.prompt;
    const originalNegativePrompt = data.negativePrompt || '';
    const sanitizedPrompt = sanitizePromptAges(data.prompt);
    const sanitizedNegativePrompt = sanitizeNegativePrompt(data.negativePrompt || '');
    
    // Log if sanitization occurred
    if (originalPrompt !== sanitizedPrompt) {
      console.log('🛡️ Frontend: Prompt sanitized for age compliance');
      console.log('🛡️ Frontend: Original:', originalPrompt);
      console.log('🛡️ Frontend: Sanitized:', sanitizedPrompt);
    }
    
    if (originalNegativePrompt !== sanitizedNegativePrompt) {
      console.log('🛡️ Frontend: Safety terms added to negative prompt');
      console.log('🛡️ Frontend: Original negative:', originalNegativePrompt);
      console.log('🛡️ Frontend: Sanitized negative:', sanitizedNegativePrompt);
    }
    
    // Use sanitized prompts for validation and display
    data.prompt = sanitizedPrompt;
    data.negativePrompt = sanitizedNegativePrompt;
    
    // DEBUG: Log what's actually being submitted
    console.log('🔍 Frontend: Final submission data negative prompt:', data.negativePrompt);
    
    // Validate model selection
    if (!data.modelId) {
      toast({
        title: "Model Required",
        description: "Please select a model to generate images",
        variant: "destructive",
      });
      return;
    }
    
    // Validate img2img requirements
    if (generationType === "img2img" && !sourceImageUrl) {
      toast({
        title: "Image Required",
        description: "Please select a base image for image-to-image generation",
        variant: "destructive",
      });
      return;
    }

    // Check if Event is selected for step-by-step processing
    if (selectedEvent) {
      try {
        // Fetch event steps
        const stepsResponse = await apiRequest("GET", `/api/events/${selectedEvent.id}/steps`);
        const steps = await stepsResponse.json() as any[];
        
        if (steps && steps.length > 0) {
          // Prepare base submission data
          const baseSubmissionData = {
            ...data,
            seed: data.seed,
            characterId: selectedCharacter?.id || undefined,
            characterName: selectedCharacter?.name || undefined,
            sceneName: selectedScene?.title || undefined,
            eventName: selectedEvent.title,
            generationType,
            sourceImageUrl: generationType === "img2img" ? sourceImageUrl : undefined,
            denoiseStrength: generationType === "img2img" ? denoiseStrength : undefined,
            useFirstImageSeedOffset,
          };

          // Process each step to create modified prompts (without sanitization yet)
          const stepGenerations = steps.map((step, index) => {
            let stepPrompt = data.prompt;
            
            // Apply words to add
            if (step.wordsToAdd && step.wordsToAdd.length > 0) {
              const wordsToAdd = step.wordsToAdd.join(', ');
              stepPrompt = stepPrompt ? `${stepPrompt}, ${wordsToAdd}` : wordsToAdd;
            }
            
            // Remove words to remove
            if (step.wordsToRemove && step.wordsToRemove.length > 0) {
              step.wordsToRemove.forEach((wordToRemove: string) => {
                const regex = new RegExp(`\\b${wordToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                stepPrompt = stepPrompt.replace(regex, '').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '');
              });
            }
            
            return {
              stepNumber: index + 1,
              stepTitle: step.title,
              originalPrompt: stepPrompt,
              editedPrompt: stepPrompt,
              hasChanges: false,
            };
          });

          // Store the base event data for later use
          setBaseEventData(baseSubmissionData);
          setEventStepsForEditing(stepGenerations);
          
          // Show the prompt editor instead of going to confirmation
          setShowEventPromptEditor(true);
          return;
        } else {
          // No steps found for this event
          toast({
            title: "Event has no steps",
            description: `The event "${selectedEvent.title}" has no steps configured. Please add steps in the Events section first.`,
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        toast({
          title: "Failed to load event steps",
          description: "Cannot process event. Proceeding with normal generation.",
          variant: "destructive",
        });
      }
    }

    // Normal single generation (no event selected)
    const submissionData = {
      ...data,
      seed: data.seed,
      characterId: selectedCharacter?.id || undefined,
      characterName: selectedCharacter?.name || undefined,
      sceneName: selectedScene?.title || undefined,
      generationType,
      sourceImageUrl: generationType === "img2img" ? sourceImageUrl : undefined,
      denoiseStrength: generationType === "img2img" ? denoiseStrength : undefined,
      useFirstImageSeedOffset,
      // Krea 2 FAL-path fields — passed through to orchestration layer
      aspectRatio: data.aspectRatio ?? '1:1',
      creativity: data.creativity ?? 'medium',
    };
    
    console.log('🎲 Frontend submitting seed:', data.seed, '(should be -1 for random)');
    console.log('🔍 Frontend submitting LoRAs:', data.loras, '(should be empty array if none selected)');
    
    // Show confirmation modal before sending to CivitAI
    setPendingGeneration(submissionData);
    setShowConfirmation(true);
  };


  const handleConfirmGeneration = async () => {
    if (pendingGeneration) {
      setShowConfirmation(false);
      
      // Check if this is event-based generation
      if ((pendingGeneration as any).isEventBased && (pendingGeneration as any).stepGenerations) {
        const stepGenerations = (pendingGeneration as any).stepGenerations;
        
        toast({
          title: "Event Processing Started",
          description: `Processing ${stepGenerations.length} steps sequentially...`,
        });
        
        // Process each step sequentially with delays
        for (let i = 0; i < stepGenerations.length; i++) {
          const stepData = stepGenerations[i];
          
          toast({
            title: `Processing Step ${i + 1}`,
            description: `"${stepData.stepTitle}" - Step ${i + 1} of ${stepGenerations.length}`,
          });
          
          try {
            // Generate for this step
            await new Promise((resolve, reject) => {
              generateMutation.mutate(stepData, {
                onSuccess: () => resolve(true),
                onError: (error) => reject(error)
              });
            });
            
            // Add delay between steps (except for the last one)
            if (i < stepGenerations.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
          } catch (error) {
            toast({
              title: `Step ${i + 1} Failed`,
              description: `Error processing "${stepData.stepTitle}". Continuing with remaining steps.`,
              variant: "destructive",
            });
            
            // Continue with next step even if current one fails
            if (i < stepGenerations.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Shorter delay after failure
            }
          }
        }
        
        toast({
          title: "Event Processing Complete",
          description: `All ${stepGenerations.length} steps have been processed.`,
        });
        
      } else {
        // Normal single generation
        generateMutation.mutate(pendingGeneration);
      }
      
      setPendingGeneration(null);
    }
  };

  const handleCancelGeneration = () => {
    setShowConfirmation(false);
    setPendingGeneration(null);
  };

  const handleEventPromptsConfirmed = (editedSteps: any[]) => {
    if (!baseEventData || !selectedEvent) return;
    
    setShowEventPromptEditor(false);

    // Create step generations with sanitized prompts
    const stepGenerations = editedSteps.map((step) => {
      // Sanitize the edited prompt
      const stepSanitizedPrompt = sanitizePromptAges(step.editedPrompt);
      const stepSanitizedNegativePrompt = sanitizeNegativePrompt(baseEventData.negativePrompt || '');
      
      return {
        ...baseEventData,
        prompt: stepSanitizedPrompt,
        negativePrompt: stepSanitizedNegativePrompt,
        stepNumber: step.stepNumber,
        stepTitle: step.stepTitle,
        totalSteps: editedSteps.length,
      };
    });

    // Prepare Event confirmation data with first step preview
    const firstStep = editedSteps[0];
    const firstStepSanitized = sanitizePromptAges(firstStep.editedPrompt);

    const eventConfirmationData = {
      ...baseEventData,
      prompt: firstStepSanitized,
      negativePrompt: sanitizeNegativePrompt(baseEventData.negativePrompt || ''),
      isEventBased: true,
      eventTitle: selectedEvent.title,
      eventDescription: selectedEvent.description,
      originalPrompt: sanitizePromptAges(baseEventData.prompt),
      firstStepTitle: firstStep.stepTitle,
      totalSteps: editedSteps.length,
      stepGenerations // Include for processing
    };

    // Store the event confirmation data and step generations for sequential processing
    setPendingGeneration(eventConfirmationData as any);
    setShowConfirmation(true);
  };

  const handleEventPromptEditorClose = () => {
    setShowEventPromptEditor(false);
    setEventStepsForEditing([]);
    setBaseEventData(null);
  };

  // Quality words file management
  const downloadQualityWords = () => {
    const allWords = { ...qualityWords, ...customQualityWords };
    const content = Object.entries(allWords)
      .map(([category, words]) => `[${category}]\n${words.join('\n')}\n`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image-quality-words.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded Successfully",
      description: "Image quality words have been saved to your device",
    });
  };

  const handleQualityUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const newCustomWords: Record<string, string[]> = {};
        let currentCategory = '';
        
        content.split('\n').forEach(line => {
          line = line.trim();
          if (line.startsWith('[') && line.endsWith(']')) {
            currentCategory = line.slice(1, -1);
            newCustomWords[currentCategory] = [];
          } else if (line && currentCategory) {
            newCustomWords[currentCategory].push(line);
          }
        });

        // Merge with existing custom words
        const updatedCustomWords = { ...customQualityWords, ...newCustomWords };
        setCustomQualityWords(updatedCustomWords);
        localStorage.setItem('customQualityWords', JSON.stringify(updatedCustomWords));
        
        toast({
          title: "Upload Successful",
          description: `Added ${Object.keys(newCustomWords).length} categories with quality terms`,
        });
      } catch (error) {
        toast({
          title: "Upload Failed",
          description: "Failed to parse the uploaded file",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Quality group management
  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; words: string }) => {
      const response = await apiRequest('POST', '/api/quality-groups', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality-groups'] });
      setShowCreateGroup(false);
      setGroupName('');
      setGroupDescription('');
      setGroupWords('');
      setSelectedWordsForGroup([]);
      toast({
        title: "Group Created",
        description: "Quality group has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create quality group",
        variant: "destructive",
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/quality-groups/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality-groups'] });
      toast({
        title: "Group Deleted",
        description: "Quality group has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete quality group",
        variant: "destructive",
      });
    },
  });

  const handleCreateGroup = () => {
    if (!groupName.trim() || !groupWords.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a name and words for the quality group",
        variant: "destructive",
      });
      return;
    }

    const allWords = [...selectedWordsForGroup, ...groupWords.split(',').map(w => w.trim()).filter(w => w)];
    const uniqueWords = Array.from(new Set(allWords));
    
    createGroupMutation.mutate({
      name: groupName.trim(),
      description: groupDescription.trim() || undefined,
      words: uniqueWords.join(', '),
    });
  };

  const handleUseGroup = (group: QualityGroup) => {
    const currentPrompt = form.getValues('prompt') || '';
    // Quality terms should be at the beginning
    const newPrompt = currentPrompt ? `${group.words}, ${currentPrompt}` : group.words;
    form.setValue('prompt', newPrompt);
    setShowQualityDialog(false);
    toast({
      title: "Quality Group Applied",
      description: `"${group.name}" has been added to your prompt`,
    });
  };

  const handleAddWordToGroup = (word: string) => {
    if (!selectedWordsForGroup.includes(word)) {
      setSelectedWordsForGroup(prev => [...prev, word]);
    }
  };

  const handleRemoveWordFromGroup = (word: string) => {
    setSelectedWordsForGroup(prev => prev.filter(w => w !== word));
  };

  // Filter models based on search term (name, type, base model, or CivitAI ID)
  const _msLower = modelSearchTerm.toLowerCase();
  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(_msLower) ||
    model.type.toLowerCase().includes(_msLower) ||
    (model.baseModel && model.baseModel.toLowerCase().includes(_msLower)) ||
    (model.civitaiId && model.civitaiId.toLowerCase().includes(_msLower))
  );

  const handleModelSelect = (modelId: string) => {
    form.setValue('modelId', modelId);
    setShowModelSearch(false);
    setModelSearchTerm('');
    
    const selectedModel = models.find(m => m.id === modelId);
    if (selectedModel) {
      toast({
        title: "Model Selected",
        description: `Changed to ${selectedModel.name}`,
      });
    }
  };

  // Image upload handler for img2img
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    // Convert to base64 for preview and submission
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      setSourceImageUrl(base64String);
      toast({
        title: "Image Uploaded",
        description: "Base image ready for image-to-image generation",
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 sm:pb-8 mobile-safe generation-panel-container">
      {/* Generation Form */}
      <Card className="bg-dark-card border-dark-border">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Sparkles className="mr-3 h-5 w-5 text-primary-500" />
            Generate Image
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
              console.error('🚨 FORM VALIDATION ERRORS:', errors);
              console.error('🚨 Current form values:', form.getValues());
              
              // Check for cfgScale issues specifically
              if (errors.cfgScale) {
                const currentCfgScale = form.getValues('cfgScale');
                console.error('🚨 CFG Scale issue:', { currentValue: currentCfgScale, error: errors.cfgScale });
                
                // Fix cfgScale if it's out of range
                if (typeof currentCfgScale === 'number' && (currentCfgScale < 1 || currentCfgScale > 30)) {
                  console.log('🔧 Fixing cfgScale value from', currentCfgScale, 'to 7.0');
                  form.setValue('cfgScale', 7.0);
                  toast({
                    title: "CFG Scale Fixed",
                    description: "CFG Scale was out of range and has been reset to 7.0. Please try generating again.",
                  });
                  return;
                }
              }
              
              toast({
                title: "Form Validation Error",
                description: `Please check the form: ${Object.keys(errors).join(', ')} have issues`,
                variant: "destructive",
              });
            })} className="space-y-6">
              {/* Prompt */}
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex flex-wrap items-center justify-between gap-y-2">
                      <span>Prompt</span>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-slate-400 hover:text-white"
                          onClick={handleSavePrompt}
                          disabled={savePromptMutation.isPending}
                          data-testid="button-save-prompt-inline"
                          title="Save current prompt"
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {savePromptMutation.isPending ? 'Saving…' : 'Save'}
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-slate-400 hover:text-white"
                              data-testid="button-load-prompt"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Load
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-dark-card border-dark-border max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="text-white">Load Saved Prompt</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              {savedPrompts.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                  <p>No saved prompts yet</p>
                                  <p className="text-sm">Create some prompts first to load them here</p>
                                </div>
                              ) : (
                                savedPrompts.map((savedPrompt) => (
                                  <div
                                    key={savedPrompt.id}
                                    className="bg-dark-bg border border-dark-border rounded-lg p-3 hover:border-primary-500/50 transition-colors cursor-pointer"
                                    onClick={() => handleLoadPrompt(savedPrompt)}
                                    data-testid={`saved-prompt-${savedPrompt.id}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-white text-sm mb-1">
                                          {savedPrompt.title}
                                        </h3>
                                        <p className="text-xs text-slate-400 line-clamp-2">
                                          {savedPrompt.prompt.length > 100 
                                            ? `${savedPrompt.prompt.substring(0, 100)}...` 
                                            : savedPrompt.prompt}
                                        </p>
                                        {savedPrompt.negativePrompt && (
                                          <p className="text-xs text-red-400 mt-1 line-clamp-1">
                                            Negative: {savedPrompt.negativePrompt.length > 50 
                                              ? `${savedPrompt.negativePrompt.substring(0, 50)}...` 
                                              : savedPrompt.negativePrompt}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <Download className="h-3 w-3" />
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShotStyle(shotStyle === 'best' ? 'candid' : 'best')}
                          className={`h-8 px-2.5 text-xs ${shotStyle === 'candid' ? 'text-amber-400 hover:text-amber-300' : 'text-slate-400 hover:text-white'}`}
                          title={shotStyle === 'candid'
                            ? 'Candid: enhance as an amateur, unposed snapshot (tap for Best Quality)'
                            : 'Best Quality: enhance as a polished professional shot (tap for Candid)'}
                          data-testid="button-shot-style"
                        >
                          {shotStyle === 'candid' ? '📷 Candid' : '✨ Best'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleAIEnhance}
                          disabled={isAIEnhancing || aiEnhanceMutation.isPending}
                          className="h-8 px-2.5 text-xs text-primary-400 hover:text-white hover:bg-primary-500/20"
                          data-testid="button-ai-enhance"
                        >
                          {isAIEnhancing || aiEnhanceMutation.isPending ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 mr-1" />
                          )}
                          AI Enhance
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`inline-flex items-center h-5 px-1.5 rounded border text-[10px] font-medium cursor-default select-none ${promptStyleInfo.colorClass}`}
                                data-testid="badge-prompt-style"
                              >
                                {promptStyleInfo.label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-center">
                              {promptStyleInfo.tooltip}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClearPrompt}
                          className="h-8 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-red-500/20"
                          data-testid="button-clear-prompt"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                      </div>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the image you want to generate..."
                        className="bg-dark-bg border-dark-border resize-none text-base"
                        rows={8}
                        data-testid="textarea-prompt"
                        {...field}
                      />
                    </FormControl>
                    <div className="relative mt-2">
                      <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400 pointer-events-none" />
                      <Input
                        value={enhanceDirection}
                        onChange={(e) => setEnhanceDirection(e.target.value)}
                        placeholder="Optional: direct the AI Enhance (e.g. 'beach at sunset, playful mood')"
                        className="bg-dark-bg border-dark-border pl-9 h-10 text-base placeholder:text-slate-500"
                        maxLength={300}
                        data-testid="input-enhance-direction"
                      />
                      {enhanceDirection && (
                        <button
                          type="button"
                          onClick={() => setEnhanceDirection('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
                          aria-label="Clear enhance direction"
                          data-testid="button-clear-enhance-direction"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      ✨ This tells AI Enhance what direction to take when it rewrites your prompt.
                    </div>
                    <div className="text-sm text-slate-400 mt-2">
                      💡 Edit the prompt above, then hit generate!
                    </div>
                    
                    {/* Quick Tags */}
                    <QuickTagsSection
                      quickTags={quickTags}
                      isEditingTags={isEditingTags}
                      setIsEditingTags={setIsEditingTags}
                      newTagText={newTagText}
                      setNewTagText={setNewTagText}
                      selectedTags={selectedTags}
                      handleAddTag={handleAddTag}
                      handleAddNewTag={handleAddNewTag}
                      handleDeleteTag={handleDeleteTag}
                      handleResetTags={handleResetTags}
                    />
                    
                    <FormMessage />
                  </FormItem>
                )}
              />



              {/* Basic Settings */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <Select onValueChange={value => field.onChange(Number(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger className="bg-dark-bg border-dark-border" data-testid="select-quantity">
                            <SelectValue placeholder="1" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 Image</SelectItem>
                          <SelectItem value="2">2 Images</SelectItem>
                          <SelectItem value="4">4 Images</SelectItem>
                          <SelectItem value="8">8 Images</SelectItem>
                          <SelectItem value="12">12 Images</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

                  {/* Model Selection - Hidden when Diffus provider is active */}
                  <ModelSelectionSection
                    isDiffusProvider={isDiffusProvider}
                    form={form}
                    showModelSearch={showModelSearch}
                    setShowModelSearch={setShowModelSearch}
                    modelSearchTerm={modelSearchTerm}
                    setModelSearchTerm={setModelSearchTerm}
                    filteredModels={filteredModels}
                    handleModelSelect={handleModelSelect}
                    refreshModelsMutation={refreshModelsMutation}
                    models={models}
                    modelsLoading={modelsLoading}
                  />

              {/* LoRA Selector — visible for all models including base Krea 2.
                  When LoRAs are selected with base Krea 2, the server auto-routes
                  through the comfy engine so they actually apply. */}
              {(
                <LoRASelector
                  selectedLoras={form.watch('loras')}
                  onLorasChange={(loras) => form.setValue('loras', loras)}
                  characterLoraIds={selectedCharacter?.loras?.map((l: any) => l.id) ?? []}
                  onTriggerWordClick={(word) => {
                    const currentPrompt = form.getValues('prompt') || '';
                    const newPrompt = currentPrompt ? `${currentPrompt}, ${word}` : word;
                    form.setValue('prompt', newPrompt);
                    toast({
                      title: "Trigger Word Added",
                      description: `"${word}" has been added to your prompt.`,
                    });
                  }}
                />
              )}

              {/* Comfy-mode hint — shown when base Krea 2 (not Turbo) has LoRAs active.
                  The server silently switches to the comfy engine in this case, which
                  changes the available controls (steps/CFG instead of aspect ratio/creativity).
                  This note makes that routing decision visible to the user. */}
              {selectedModelFamily === 'krea2' &&
                !selectedModelBaseModel.toLowerCase().includes('turbo') &&
                (form.watch('loras') ?? []).length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    <span className="mt-0.5 shrink-0">⚡</span>
                    <span>
                      LoRAs enabled — using <strong>comfy engine</strong>. Steps &amp; CFG are now active; aspect ratio &amp; creativity controls are paused until LoRAs are removed.
                    </span>
                  </div>
                )}

              {/* Advanced Settings Toggle */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-primary-500 hover:text-primary-400 p-0"
                data-testid="button-advanced-toggle"
              >
                <Settings className="mr-2 h-4 w-4" />
                Advanced Settings
                <ChevronDown className={`ml-2 h-4 w-4 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </Button>

              {/* Advanced Settings */}
              {showAdvanced && (
                <div className="space-y-4 p-4 bg-dark-bg rounded-lg border border-dark-border">
                  {/* Generation Type Selection */}
                  <div className="flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Generation Type
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => { setGenerationType("txt2img"); setSourceImageUrl(null); }}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-all min-w-[110px] ${
                          generationType === "txt2img" 
                            ? "bg-blue-600 hover:bg-blue-700 text-white" 
                            : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                        }`}
                        data-testid="button-txt2img"
                      >
                        📝 Text2Image
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setGenerationType("img2img")}
                        disabled={imageProviderStatus?.provider === 'runpod'}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-all min-w-[110px] ${
                          imageProviderStatus?.provider === 'runpod'
                            ? "bg-slate-600 text-slate-400 cursor-not-allowed opacity-60"
                            : generationType === "img2img"
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                        }`}
                        data-testid="button-img2img"
                        title={imageProviderStatus?.provider === 'runpod'
                          ? "Image-to-image is not supported with the RunPod provider"
                          : "Generate using an uploaded image as the starting point (uses Flux 2 Klein regardless of selected model)"}
                      >
                        🖼️ Image2Image
                      </Button>
                    </div>
                    
                    {/* Image Upload for img2img */}
                    {generationType === "img2img" && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Base Image
                        </label>
                        <div className="flex items-center space-x-3">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="block w-full text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-blue-50 file:text-blue-700
                              hover:file:bg-blue-100
                              dark:file:bg-blue-900 dark:file:text-blue-300"
                            data-testid="input-source-image"
                          />
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500">Denoise:</span>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              value={denoiseStrength}
                              onChange={(e) => setDenoiseStrength(Number(e.target.value))}
                              className="w-20"
                              data-testid="slider-denoise-strength"
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 w-8">
                              {(denoiseStrength / 100).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {sourceImageUrl && (
                          <div className="mt-2">
                            <img
                              src={sourceImageUrl}
                              alt="Source image preview"
                              className="max-w-32 max-h-32 object-cover rounded-lg border"
                              data-testid="img-source-preview"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-1 border-t border-dark-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Character, Scenes & Events</h3>
                  </div>
                  {/* Character Selection */}
                  <CharacterSection
                    showCharacterSearch={showCharacterSearch}
                    setShowCharacterSearch={setShowCharacterSearch}
                    characterSearchTerm={characterSearchTerm}
                    setCharacterSearchTerm={setCharacterSearchTerm}
                    filteredCharacters={filteredCharacters}
                    handleCharacterSelect={handleCharacterSelect}
                    selectedCharacter={selectedCharacter}
                    handleCharacterClear={handleCharacterClear}
                  />
                  
                  {/* Saved Scene Selector */}
                  <SceneSelector
                    selectedScene={selectedScene}
                    savedScenes={savedScenes}
                    handleSceneSelect={handleSceneSelect}
                    handleSceneClear={handleSceneClear}
                  />

                  {/* Event Selector */}
                  <EventSelector
                    selectedEvent={selectedEvent}
                    selectedEventStepCount={selectedEventStepCount}
                    form={form}
                    events={events}
                    handleEventSelect={handleEventSelect}
                    handleEventClear={handleEventClear}
                  />

                  <div className="pt-3 mt-1 border-t border-dark-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prompts</h3>
                  </div>
                  {/* Save Prompt */}
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSavePrompt}
                      disabled={savePromptMutation.isPending}
                      className="bg-dark-bg border-dark-border text-white hover:bg-slate-700"
                      data-testid="button-save-prompt"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {savePromptMutation.isPending ? 'Saving...' : 'Save Prompt'}
                    </Button>
                  </div>

                  {/* Negative Prompt, Seed, Sampler & Output settings */}
                  <GenerationParamsFields
                    form={form}
                    toast={toast}
                    useFirstImageSeedOffset={useFirstImageSeedOffset}
                    setUseFirstImageSeedOffset={setUseFirstImageSeedOffset}
                    user={user}
                    updatePreferencesMutation={updatePreferencesMutation}
                    modelFamily={selectedModelFamily}
                    modelBaseModel={selectedModelBaseModel}
                  />
                </div>
              )}

              {/* Generate Button and Clear Progress */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={generateMutation.isPending}
                    className="flex-1 bg-primary-500 hover:bg-primary-600 text-white font-semibold py-4 px-3 sm:px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    data-testid="button-generate"
                  >
                    {generateMutation.isPending ? (
                      <>
                        <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>Starting…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span className="hidden sm:inline">Generate Image</span>
                        <span className="sm:hidden">Generate</span>
                      </>
                    )}
                  </Button>
                  
                  {/* Clear All Progress Button - Always visible */}
                  <Button
                    type="button"
                    onClick={clearActiveGenerations}
                    variant="outline"
                    className="border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 py-4 px-3"
                    data-testid="button-clear-all-progress"
                    title="Clear all stuck generations and progress"
                  >
                    <X className="h-4 w-4" />
                    <span className="hidden sm:inline ml-2">Clear All</span>
                  </Button>
                </div>
              </div>
              
              {/* Generation Time Notice */}
              <div className="text-center">
                <p className="text-sm text-slate-400">
                  ⏱️ Generation takes 2-3 minutes. Please be patient.
                </p>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Active Generations Progress - FipFap style with time-based progress */}
      {activeGenerations.size > 0 && (
        <ActiveGenerationsProgress
          activeGenerations={activeGenerations}
          dismissedProgressBars={dismissedProgressBars}
          setDismissedProgressBars={setDismissedProgressBars}
          generations={generations}
        />
      )}

      {/* Generated Images Gallery */}
      <div className="relative image-gallery-container">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Generations</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/generations/recent'] });
              queryClient.invalidateQueries({ queryKey: ['/api/generations'] });
              toast({
                title: "Gallery Refreshed",
                description: "Checking for new images...",
              });
            }}
            className="text-primary-500 hover:text-primary-400"
            data-testid="button-refresh-gallery"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-[300px]">
          {/* Placeholder cards for images being generated - 4 across on mobile */}
          {pendingImagePlaceholders.size > 0 && (
            <PendingPlaceholdersGrid pendingImagePlaceholders={pendingImagePlaceholders} />
          )}
          <ImageGallery 
            generations={generations} 
            onImageClick={onImageClick} 
            allowMultiSelect={true}
            showViewAll={true}
          />
        </div>
      </div>

      {/* Community Images Section - Static Display */}
      {(communityImages as SharedImage[]).length > 0 && (
        <CommunityHighlights communityTicker={communityTicker} onImageClick={onImageClick} />
      )}

      {/* Generation Confirmation Modal */}
      <GenerationConfirmationModal
        isOpen={showConfirmation}
        onClose={handleCancelGeneration}
        onConfirm={handleConfirmGeneration}
        generationData={pendingGeneration ? {
          ...pendingGeneration,
          negativePrompt: pendingGeneration.negativePrompt || ''
        } : {} as any}
        model={pendingGeneration ? (models.find(m => m.id === pendingGeneration.modelId) as any) || null : null}
        isSubmitting={generateMutation.isPending}
      />

      {/* Event Prompt Editor Modal */}
      <EventPromptEditor
        isOpen={showEventPromptEditor}
        onClose={handleEventPromptEditorClose}
        onConfirm={handleEventPromptsConfirmed}
        eventTitle={selectedEvent?.title || ''}
        eventDescription={selectedEvent?.description || undefined}
        steps={eventStepsForEditing}
        basePrompt={baseEventData?.prompt || ''}
      />

      {/* AI Enhancement Dialog */}
      <AIEnhancementDialog
        aiEnhancementResult={aiEnhancementResult}
        setAiEnhancementResult={setAiEnhancementResult}
        handleAcceptAIEnhancement={handleAcceptAIEnhancement}
        handleRejectAIEnhancement={handleRejectAIEnhancement}
      />

      {/* Generation Reward Popups - FipFap-style support for multiple simultaneous popups */}
      {Array.from(activePopups.entries()).map(([popupId, { generation, generationId, imageUrl }], index) => (
        <GenerationRewardPopup
          key={`popup-${popupId}`}
          generation={generation}
          generationId={generationId}
          imageUrl={imageUrl}
          onClose={() => {
            setActivePopups(prev => {
              const newMap = new Map(prev);
              newMap.delete(popupId);
              return newMap;
            });
          }}
          isOpen={true}
          offsetIndex={index}
        />
      ))}
    </div>
  );
}
