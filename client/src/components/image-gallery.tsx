import { useState, useMemo, useRef, useCallback } from 'react';
import { Download, Eye, Star, Trash2, CheckSquare, Square, X, User, Filter, Calendar, ChevronDown, Users, Sparkles, Heart, UserPlus, Loader2 } from 'lucide-react';

// Helper to get the proper image URL that goes through the watermarking endpoint.
// Used for downloads/saving, where the watermarked/stored copy is wanted.
const getWatermarkedImageUrl = (generationId: string): string => {
  return `/api/images/${generationId}`;
};

// Display URL for the gallery grid. Once the background pipeline has stored an
// image, the server rewrites imageUrl to `/api/images/:id` (fast: streamed from
// object storage). Freshly generated images still carry the direct CDN URL —
// render that immediately instead of forcing `/api/images/:id`, which would
// make the server download the image from the CDN and watermark it on the fly
// for every grid cell. That server-side round trip (while the same box is busy
// storing the batch) is what made new images take minutes to appear.
const getDisplayImageUrl = (generation: { id: string; imageUrl?: string | null }): string => {
  const url = generation.imageUrl;
  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api/'))) {
    return url;
  }
  return `/api/images/${generation.id}`;
};

// Swipeable card component for mobile delete gesture
interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete: () => void;
  isMultiSelectMode: boolean;
  className?: string;
}

function SwipeableCard({ children, onDelete, isMultiSelectMode, className = '' }: SwipeableCardProps) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const SWIPE_THRESHOLD = 80; // Minimum swipe distance to trigger delete reveal
  const MAX_SWIPE = 100; // Maximum swipe distance
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isMultiSelectMode) return;
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    });
  }, [isMultiSelectMode]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart || isMultiSelectMode) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStart.x;
    const deltaY = currentY - touchStart.y;
    
    // Only handle horizontal swipes (right direction only)
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      // Prevent page scroll during swipe
      e.preventDefault();
      // Apply resistance as swipe increases
      const resistance = 0.6;
      const offset = Math.min(deltaX * resistance, MAX_SWIPE);
      setSwipeOffset(offset);
    }
  }, [touchStart, isMultiSelectMode]);
  
  const handleTouchEnd = useCallback(() => {
    if (!touchStart || isMultiSelectMode) {
      setTouchStart(null);
      return;
    }
    
    // If swiped past threshold, show delete confirmation
    if (swipeOffset >= SWIPE_THRESHOLD) {
      setShowDeleteConfirm(true);
      setSwipeOffset(MAX_SWIPE); // Lock at max position
    } else {
      // Reset swipe
      setSwipeOffset(0);
      setShowDeleteConfirm(false);
    }
    
    setTouchStart(null);
  }, [touchStart, swipeOffset, isMultiSelectMode]);
  
  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
    // Reset state after delete
    setSwipeOffset(0);
    setShowDeleteConfirm(false);
  }, [onDelete]);
  
  const handleCancelSwipe = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSwipeOffset(0);
    setShowDeleteConfirm(false);
  }, []);
  
  return (
    <div className={`relative overflow-hidden ${className}`} ref={cardRef}>
      {/* Delete button revealed behind the card */}
      <div 
        className="absolute inset-0 bg-red-600 flex items-center justify-end pr-4 rounded-lg"
        style={{ 
          opacity: swipeOffset > 0 ? 1 : 0,
          transition: swipeOffset === 0 ? 'opacity 0.2s ease' : 'none'
        }}
      >
        {showDeleteConfirm ? (
          <div className="flex flex-col gap-2 items-center">
            <button
              onClick={handleDeleteClick}
              className="bg-white text-red-600 font-bold px-4 py-2 rounded-lg text-sm shadow-lg"
              data-testid="button-swipe-delete-confirm"
            >
              <Trash2 className="h-4 w-4 inline mr-1" />
              Delete
            </button>
            <button
              onClick={handleCancelSwipe}
              className="text-white/80 text-xs underline"
              data-testid="button-swipe-delete-cancel"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="text-white flex items-center gap-2 opacity-70">
            <Trash2 className="h-5 w-5" />
            <span className="text-sm font-medium">Swipe to delete</span>
          </div>
        )}
      </div>
      
      {/* Main card content that slides */}
      <div
        className="relative bg-dark-bg rounded-lg"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: touchStart ? 'none' : 'transform 0.2s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Generation, Model, User as UserType } from '@/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, markGenerationsDeleted, isGenerationDeleted } from '@/lib/queryClient';
import ImageModal from '@/components/image-modal';
import type { Character, SavedScene } from '@shared/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface ImageGalleryProps {
  generations: Generation[];
  showViewAll?: boolean;
  gridCols?: 'small' | 'medium' | 'large';
  showMetadata?: boolean;
  onImageClick?: (generation: Generation) => void;
  allowMultiSelect?: boolean;
}



export default function ImageGallery({ 
  generations, 
  showViewAll = true, 
  gridCols = 'medium',
  showMetadata = false,
  onImageClick,
  allowMultiSelect = true
}: ImageGalleryProps) {
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Enhancement modal state
  const [showEnhancementModal, setShowEnhancementModal] = useState(false);
  const [enhancementScale, setEnhancementScale] = useState<2 | 4>(2);
  const [enhancementModel, setEnhancementModel] = useState<'realesrgan' | 'gfpgan'>('realesrgan');
  const [faceEnhancement, setFaceEnhancement] = useState(false);
  
  // Save to Character modal state (admin only)
  const [showSaveToCharacterModal, setShowSaveToCharacterModal] = useState(false);
  const [saveToCharacterId, setSaveToCharacterId] = useState<string>('');
  const [savePresetName, setSavePresetName] = useState<string>('');
  const [updateCharacterSettings, setUpdateCharacterSettings] = useState(true);
  const [generationToSave, setGenerationToSave] = useState<Generation | null>(null);
  const [newCharacterName, setNewCharacterName] = useState<string>('');
  
  // Filter states
  const [filterCharacter, setFilterCharacter] = useState<string>('all');
  const [filterScene, setFilterScene] = useState<string>('all');
  const [filterOutfit, setFilterOutfit] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<string>('all');
  
  // Track pending deletions to filter them out even if refetch brings them back
  const pendingDeletionsRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0); // Force re-render when pending deletions change
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Filter out deleted generations using BOTH global store AND local ref
  // Global store is the definitive source of truth that NEVER clears
  // This ensures deleted images stay hidden even if WebSocket triggers a refetch
  const completedGenerations = generations.filter(gen => {
    if (isGenerationDeleted(gen.id) || pendingDeletionsRef.current.has(gen.id)) return false;
    // Always show video jobs so users can see them processing and after completion.
    if ((gen as any).generationType === 'img2vid') return true;
    // Regular images: must be completed with an imageUrl.
    return gen.status === 'completed' && !!gen.imageUrl;
  });

  // Fetch models to get model details
  const { data: allModels = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  const getModel = (modelId?: string) => {
    if (!modelId) return null;
    return allModels.find(model => model.id === modelId) || null;
  };

  // Fetch characters to get character names
  const { data: allCharacters = [] } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
  });

  // Fetch current user to check admin status
  const { data: currentUser } = useQuery<UserType>({
    queryKey: ['/api/user'],
  });
  
  const isAdmin = currentUser?.isAdmin === true;

  // Fetch shared images to check sharing status
  const { data: sharedImagesData } = useQuery({
    queryKey: ['/api/shared-images?limit=1000&offset=0'], // Get all shared images for checking
  });

  // Extract images array from pagination response  
  const sharedImages = Array.isArray((sharedImagesData as any)?.images) ? (sharedImagesData as any).images : [];

  // Check if a generation is shared
  const isGenerationShared = (generationId: string) => {
    return sharedImages.some((shared: any) => shared.generationId === generationId);
  };

  // Get shared image ID for a generation
  const getSharedImageId = (generationId: string) => {
    const shared = sharedImages.find((shared: any) => shared.generationId === generationId);
    return shared?.id;
  };

  // Fetch saved scenes for filtering
  const { data: allSavedScenes = [] } = useQuery<SavedScene[]>({
    queryKey: ['/api/saved-scenes'],
  });

  // Fetch user's favorites
  const { data: favoritesData } = useQuery<{ generationId: string }[]>({
    queryKey: ['/api/favorites'],
  });

  // Create a set of favorite generation IDs for quick lookup
  const favoriteIds = useMemo(() => {
    if (!favoritesData || !Array.isArray(favoritesData)) return new Set<string>();
    return new Set(favoritesData.map(fav => fav.generationId));
  }, [favoritesData]);

  // Check if a generation is favorited
  const isGenerationFavorited = (generationId: string) => {
    return favoriteIds.has(generationId);
  };

  // Favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: async (generationId: string) => {
      return await apiRequest('POST', '/api/favorites', { generationId });
    },
    onSuccess: () => {
      // Invalidate all favorites and generations queries to ensure UI stays in sync
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      // Invalidate both filtered and unfiltered generation queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/generations');
        }
      });
      toast({
        title: "Added to Favorites",
        description: "Image has been added to your favorites.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add to favorites.",
        variant: "destructive",
      });
    },
  });

  // Unfavorite mutation
  const unfavoriteMutation = useMutation({
    mutationFn: async (generationId: string) => {
      return await apiRequest('DELETE', `/api/favorites/${generationId}`);
    },
    onSuccess: () => {
      // Invalidate all favorites and generations queries to ensure UI stays in sync
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      // Invalidate both filtered and unfiltered generation queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/generations');
        }
      });
      toast({
        title: "Removed from Favorites",
        description: "Image has been removed from your favorites.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove from favorites.",
        variant: "destructive",
      });
    },
  });

  // Save to character mutation (admin only)
  const saveToCharacterMutation = useMutation({
    mutationFn: async ({ characterId, generationId, name, updateCharacter, newCharacterName, generationPrompt }: { 
      characterId: string; 
      generationId: string; 
      name: string;
      updateCharacter: boolean;
      newCharacterName?: string;
      generationPrompt?: string;
    }) => {
      let finalCharacterId = characterId;

      // If "new" is selected, create the character first
      if (characterId === 'new' && newCharacterName) {
        const charRes = await apiRequest('POST', '/api/characters', {
          name: newCharacterName,
          basePrompt: generationPrompt || 'Character created from generation',
          isPublic: true,
        });
        const newChar = await charRes.json();
        finalCharacterId = newChar.id;
      }

      return await apiRequest('POST', `/api/characters/${finalCharacterId}/presets`, { 
        generationId, 
        name,
        updateCharacter 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      toast({
        title: "Saved to Character",
        description: updateCharacterSettings 
          ? "Generation settings saved as preset and character updated."
          : "Generation settings saved as preset.",
      });
      setShowSaveToCharacterModal(false);
      setSaveToCharacterId('');
      setSavePresetName('');
      setGenerationToSave(null);
      setNewCharacterName('');
    },
    onError: (error) => {
      console.error("Save to character error:", error);
      toast({
        title: "Error",
        description: "Failed to save generation to character.",
        variant: "destructive",
      });
    },
  });

  // Handle opening the save to character modal
  const handleOpenSaveToCharacter = (generation: Generation, e: React.MouseEvent) => {
    e.stopPropagation();
    setGenerationToSave(generation);
    setSavePresetName(`Preset - ${new Date().toLocaleDateString()}`);
    // Pre-select the character if the generation already has one
    if (generation.characterId) {
      setSaveToCharacterId(generation.characterId);
    }
    setShowSaveToCharacterModal(true);
  };

  // Handle saving to character
  const handleSaveToCharacter = () => {
    if (!generationToSave || !saveToCharacterId) {
      toast({
        title: "Error",
        description: "Please select a character to save to.",
        variant: "destructive",
      });
      return;
    }
    
    saveToCharacterMutation.mutate({
      characterId: saveToCharacterId,
      generationId: generationToSave.id,
      name: savePresetName || `Preset - ${new Date().toLocaleDateString()}`,
      updateCharacter: updateCharacterSettings,
      newCharacterName: saveToCharacterId === 'new' ? newCharacterName : undefined,
      generationPrompt: saveToCharacterId === 'new' ? generationToSave.prompt : undefined,
    });
  };

  // Toggle favorite handler
  const handleToggleFavorite = (generation: Generation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGenerationFavorited(generation.id)) {
      unfavoriteMutation.mutate(generation.id);
    } else {
      favoriteMutation.mutate(generation.id);
    }
  };

  const getCharacter = (characterId?: string) => {
    if (!characterId) return null;
    return allCharacters.find(character => character.id === characterId) || null;
  };

  // Filter and sort generations
  const filteredGenerations = useMemo(() => {
    let filtered = [...completedGenerations];

    // Filter by character
    if (filterCharacter !== 'all') {
      filtered = filtered.filter(gen => {
        if (filterCharacter === 'none') {
          return !gen.characterName && !gen.characterId;
        }
        return gen.characterName === filterCharacter;
      });
    }

    // Filter by scene
    if (filterScene !== 'all') {
      filtered = filtered.filter(gen => {
        if (filterScene === 'none') {
          return !gen.sceneName;
        }
        return gen.sceneName === filterScene;
      });
    }

    // Filter by outfit
    if (filterOutfit !== 'all') {
      filtered = filtered.filter(gen => {
        if (filterOutfit === 'none') {
          return !(gen.originalGenerationData as any)?.outfit;
        }
        // Check if the outfit matches
        const outfitData = (gen.originalGenerationData as any)?.outfit || '';
        return outfitData.toLowerCase().includes(filterOutfit.toLowerCase());
      });
    }

    // Filter by date range
    if (filterDateRange !== 'all') {
      const now = new Date();
      const cutoffDate = new Date();
      
      switch (filterDateRange) {
        case 'today':
          cutoffDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          cutoffDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      if (filterDateRange !== 'all') {
        filtered = filtered.filter(gen => new Date(gen.createdAt) >= cutoffDate);
      }
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [completedGenerations, filterCharacter, filterScene, filterOutfit, filterDateRange]);

  // Get unique characters and scenes from generations for filter options
  const uniqueCharacters = useMemo(() => {
    const characters = new Set<string>();
    completedGenerations.forEach(gen => {
      if (gen.characterName) {
        characters.add(gen.characterName);
      }
    });
    return Array.from(characters).sort();
  }, [completedGenerations]);

  const uniqueScenes = useMemo(() => {
    const scenes = new Set<string>();
    completedGenerations.forEach(gen => {
      if (gen.sceneName) {
        scenes.add(gen.sceneName);
      }
    });
    return Array.from(scenes).sort();
  }, [completedGenerations]);

  const uniqueOutfits = useMemo(() => {
    const outfits = new Set<string>();
    completedGenerations.forEach(gen => {
      const outfitData = (gen.originalGenerationData as any)?.outfit;
      if (outfitData && typeof outfitData === 'string') {
        // Extract key outfit terms from the outfit description
        const outfitTerms = outfitData.split(',').map(term => term.trim()).filter(term => term.length > 3);
        outfitTerms.forEach(term => outfits.add(term));
      }
    });
    return Array.from(outfits).sort().slice(0, 20); // Limit to most common 20 outfits
  }, [completedGenerations]);

  // Character Name Component
  const CharacterName = ({ characterId }: { characterId: string }) => {
    const character = getCharacter(characterId);
    if (!character) return null;
    
    return (
      <div className="flex items-center gap-1 text-xs text-blue-300">
        <User className="h-3 w-3" />
        <span className="truncate">{character.name}</span>
      </div>
    );
  };

  // Mutation for deleting generations with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (generationIds: string[]) => {
      // Add to GLOBAL persistent deleted IDs store - this NEVER clears
      markGenerationsDeleted(generationIds);
      
      // Also add to local ref for immediate filtering
      generationIds.forEach(id => pendingDeletionsRef.current.add(id));
      forceUpdate(n => n + 1); // Trigger re-render to hide images
      
      const promises = generationIds.map(id => 
        fetch(`/api/generations/${id}`, {
          method: 'DELETE',
        })
      );
      await Promise.all(promises);
    },
    onMutate: async (generationIds) => {
      // Clear selection immediately
      setSelectedImages(new Set());
      setIsMultiSelectMode(false);
      
      // Cancel ALL generation-related queries to prevent race conditions
      // Use predicate to match any query starting with /api/generations
      const isGenerationQuery = (query: any) => {
        const key = query.queryKey?.[0];
        return typeof key === 'string' && key.startsWith('/api/generations');
      };
      
      await queryClient.cancelQueries({ predicate: isGenerationQuery });
      
      // Immediately remove deleted items from ALL generation caches
      const removeFromCache = (oldData: any) => {
        if (!oldData) return oldData;
        
        // Handle infinite query format (pages array)
        if (oldData.pages && Array.isArray(oldData.pages)) {
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => {
              if (page.generations) {
                return {
                  ...page,
                  generations: page.generations.filter((gen: any) => !generationIds.includes(gen.id)),
                  total: Math.max(0, (page.total || 0) - generationIds.length)
                };
              }
              if (Array.isArray(page)) {
                return page.filter((gen: any) => !generationIds.includes(gen.id));
              }
              return page;
            })
          };
        }
        
        // Handle standard paginated format
        if (oldData.generations) {
          return {
            ...oldData,
            generations: oldData.generations.filter((gen: any) => !generationIds.includes(gen.id)),
            total: Math.max(0, (oldData.total || 0) - generationIds.length)
          };
        }
        
        // Handle flat array format
        if (Array.isArray(oldData)) {
          return oldData.filter((gen: any) => !generationIds.includes(gen.id));
        }
        
        return oldData;
      };
      
      // Update ALL generation-related caches using predicate matching
      // This catches /api/generations, /api/generations/recent, /api/generations?limit=10, etc.
      queryClient.setQueriesData({ predicate: isGenerationQuery }, removeFromCache);
      
      return { deletedIds: generationIds };
    },
    onSuccess: async (_, generationIds) => {
      toast({ title: `${generationIds.length} image(s) deleted!` });
      
      // Keep IDs in pendingDeletions for a short time to ensure any in-flight
      // refetches don't bring them back, then remove them
      setTimeout(() => {
        generationIds.forEach(id => pendingDeletionsRef.current.delete(id));
        // No need to force update - images are already hidden and server confirmed deletion
      }, 5000); // Keep filtered for 5 seconds after server confirms
      
      // Invalidate ALL generation queries to trigger fresh refetch
      const isGenerationQuery = (query: any) => {
        const key = query.queryKey?.[0];
        return typeof key === 'string' && key.startsWith('/api/generations');
      };
      queryClient.invalidateQueries({ predicate: isGenerationQuery });
    },
    onError: (err, generationIds, context) => {
      // Remove from pending deletions on error - they weren't actually deleted
      generationIds.forEach(id => pendingDeletionsRef.current.delete(id));
      forceUpdate(n => n + 1); // Trigger re-render to show images again
      
      // Refetch ALL generation queries to restore correct state
      const isGenerationQuery = (query: any) => {
        const key = query.queryKey?.[0];
        return typeof key === 'string' && key.startsWith('/api/generations');
      };
      queryClient.invalidateQueries({ predicate: isGenerationQuery });
      
      toast({ title: "Failed to delete images", variant: "destructive" });
    },
  });

  // Mutation for sharing images to community
  const shareMutation = useMutation({
    mutationFn: async (generationIds: string[]) => {
      await apiRequest('POST', '/api/shared-images/bulk-share', { generationIds });
    },
    onSuccess: (_, generationIds) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      setSelectedImages(new Set());
      setIsMultiSelectMode(false);
      toast({ 
        title: "Images shared to community!", 
        description: `${generationIds.length} image(s) are now visible in the community gallery.`
      });
    },
    onError: () => {
      toast({ title: "Failed to share images", variant: "destructive" });
    },
  });

  // Mutation for unsharing images from community
  const unshareMutation = useMutation({
    mutationFn: async (sharedImageIds: string[]) => {
      const promises = sharedImageIds.map(id => 
        apiRequest('DELETE', `/api/shared-images/${id}`)
      );
      await Promise.all(promises);
    },
    onSuccess: (_, sharedImageIds) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      setSelectedImages(new Set());
      setIsMultiSelectMode(false);
      toast({ 
        title: "Images unshared from community!", 
        description: `${sharedImageIds.length} image(s) removed from community gallery.`
      });
    },
    onError: () => {
      toast({ title: "Failed to unshare images", variant: "destructive" });
    },
  });

  // Enhancement mutation
  const enhancementMutation = useMutation({
    mutationFn: async ({ generationIds, scaleFactor, enhancementModel, faceEnhancement }: { 
      generationIds: string[], 
      scaleFactor: 2 | 4, 
      enhancementModel: 'realesrgan' | 'gfpgan',
      faceEnhancement: boolean 
    }) => {
      return await apiRequest('POST', '/api/enhance/submit', {
        generationIds,
        scaleFactor,
        enhancementModel,
        faceEnhancement
      });
    },
    onSuccess: (data: any) => {
      setSelectedImages(new Set());
      setIsMultiSelectMode(false);
      setShowEnhancementModal(false);
      toast({
        title: "Upscaling Started!",
        description: data.message || "Your images are being upscaled. This may take a few minutes.",
      });
      // Refresh enhancement list
      queryClient.invalidateQueries({ queryKey: ['/api/enhance/user/all'] });
    },
    onError: (error: any) => {
      toast({
        title: "Upscaling Failed",
        description: error.message || "Failed to start upscaling. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBulkEnhance = () => {
    if (selectedImages.size === 0) return;
    if (selectedImages.size > 20) {
      toast({
        title: "Too Many Images Selected",
        description: "You can upscale up to 20 images at once. Please reduce your selection.",
        variant: "destructive",
      });
      return;
    }
    setShowEnhancementModal(true);
  };

  const submitEnhancement = () => {
    enhancementMutation.mutate({
      generationIds: Array.from(selectedImages),
      scaleFactor: enhancementScale,
      enhancementModel,
      faceEnhancement: enhancementModel === 'realesrgan' ? faceEnhancement : false,
    });
  };

  const handleDownload = async (generation: Generation, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!generation.id) return;
    
    const videoUrl = (generation as any).videoUrl as string | undefined;
    try {
      const sourceUrl = videoUrl || getWatermarkedImageUrl(generation.id);
      const response = await fetch(sourceUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = videoUrl ? `civiverse-${generation.id}.mp4` : `civiverse-${generation.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: videoUrl ? "Video downloaded!" : "Image downloaded successfully!" });
    } catch (error) {
      toast({ title: videoUrl ? "Failed to download video" : "Failed to download image", variant: "destructive" });
    }
  };

  const handleDelete = async (generation: Generation, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Simple confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete this image?\n\nThis action cannot be undone.`
    );
    
    if (confirmed) {
      deleteMutation.mutate([generation.id]);
    }
  };

  const handleBulkDownload = async () => {
    const selectedGens = filteredGenerations.filter(gen => selectedImages.has(gen.id));
    
    for (const generation of selectedGens) {
      if (generation.id) {
        try {
          // Use the watermarking endpoint instead of raw CDN URL
          const response = await fetch(getWatermarkedImageUrl(generation.id));
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `civiverse-${generation.id}.jpg`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          // Small delay between downloads to avoid overwhelming the browser
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to download image ${generation.id}:`, error);
        }
      }
    }
    
    toast({ 
      title: `Downloaded ${selectedGens.length} images successfully!` 
    });
  };

  const handleBulkDelete = () => {
    if (selectedImages.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedImages.size} selected images? This action cannot be undone.`)) {
      deleteMutation.mutate(Array.from(selectedImages));
    }
  };

  const handleBulkShare = () => {
    if (selectedImages.size === 0) return;
    
    const selectedGens = filteredGenerations.filter(gen => selectedImages.has(gen.id));
    const unsharedGens = selectedGens.filter(gen => !isGenerationShared(gen.id));
    
    if (unsharedGens.length === 0) {
      toast({ title: "All selected images are already shared", variant: "destructive" });
      return;
    }
    
    if (confirm(`Share ${unsharedGens.length} selected image(s) to the community gallery? Other users will be able to see these images and their prompts.`)) {
      shareMutation.mutate(unsharedGens.map(gen => gen.id));
    }
  };

  const handleBulkUnshare = () => {
    if (selectedImages.size === 0) return;
    
    const selectedGens = filteredGenerations.filter(gen => selectedImages.has(gen.id));
    const sharedGens = selectedGens.filter(gen => isGenerationShared(gen.id));
    
    if (sharedGens.length === 0) {
      toast({ title: "No shared images selected", variant: "destructive" });
      return;
    }
    
    if (confirm(`Remove ${sharedGens.length} selected image(s) from the community gallery?`)) {
      const sharedImageIds = sharedGens.map(gen => getSharedImageId(gen.id)).filter(Boolean) as string[];
      unshareMutation.mutate(sharedImageIds);
    }
  };

  const toggleImageSelection = (generationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newSelected = new Set(selectedImages);
    if (newSelected.has(generationId)) {
      newSelected.delete(generationId);
    } else {
      newSelected.add(generationId);
    }
    setSelectedImages(newSelected);
  };

  const selectAllImages = () => {
    if (selectedImages.size === filteredGenerations.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(filteredGenerations.map(gen => gen.id)));
    }
  };

  const exitMultiSelectMode = () => {
    setIsMultiSelectMode(false);
    setSelectedImages(new Set());
  };

  const getGridClass = () => {
    switch (gridCols) {
      case 'small': return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5';
      case 'large': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      default: return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    }
  };

  if (completedGenerations.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 bg-dark-bg rounded-full mx-auto mb-6 flex items-center justify-center">
          <Star className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-medium mb-3 text-white">No images yet</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Generate your first image to see it here! Your creations will appear in this gallery.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {showViewAll && (
          <div className="space-y-3">
            {/* Header - Stack on mobile */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-white">Generated Images</h2>
                <p className="text-sm text-slate-400">
                  {filteredGenerations.length} of {completedGenerations.length} images
                  {isMultiSelectMode && selectedImages.size > 0 && (
                    <span className="ml-2 text-blue-400">
                      • {selectedImages.size} selected
                    </span>
                  )}
                </p>
              </div>

              {/* Mobile-friendly button layout - improved flex-wrap */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="text-white border-dark-border hover:bg-dark-border whitespace-nowrap"
                  data-testid="button-toggle-filters"
                >
                  <Filter className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Filters</span>
                  {(filterCharacter !== 'all' || filterScene !== 'all' || filterOutfit !== 'all' || filterDateRange !== 'all') && (
                    <span className="ml-1 w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                </Button>
                
                {allowMultiSelect && (
                  <div className="flex items-center gap-2">
                    {!isMultiSelectMode ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsMultiSelectMode(true)}
                        className="text-white border-dark-border hover:bg-dark-border whitespace-nowrap"
                        data-testid="button-multi-select"
                      >
                        <CheckSquare className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Select</span>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={exitMultiSelectMode}
                        className="text-slate-400 hover:text-white"
                        data-testid="button-exit-multi-select"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Multi-select action bar - separate row on mobile */}
            {allowMultiSelect && isMultiSelectMode && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dark-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllImages}
                  className="text-white border-dark-border hover:bg-dark-border whitespace-nowrap"
                  data-testid="button-select-all"
                >
                  {selectedImages.size === filteredGenerations.length ? (
                    <>
                      <Square className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Deselect All</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Select All</span>
                    </>
                  )}
                </Button>

                {selectedImages.size > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkDownload}
                      className="text-green-400 border-green-400/30 hover:bg-green-400/10 whitespace-nowrap"
                      data-testid="button-bulk-download"
                    >
                      <Download className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Download ({selectedImages.size})</span>
                      <span className="sm:hidden">({selectedImages.size})</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkShare}
                      disabled={shareMutation.isPending}
                      className="text-blue-400 border-blue-400/30 hover:bg-blue-400/10 whitespace-nowrap"
                      data-testid="button-bulk-share"
                    >
                      <Users className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">
                        {shareMutation.isPending ? 'Sharing...' : `Share (${selectedImages.size})`}
                      </span>
                      <span className="sm:hidden">({selectedImages.size})</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkEnhance}
                      disabled={selectedImages.size > 20}
                      className="text-purple-400 border-purple-400/30 hover:bg-purple-400/10 whitespace-nowrap"
                      data-testid="button-bulk-enhance"
                    >
                      <Sparkles className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Upscale ({selectedImages.size})</span>
                      <span className="sm:hidden">({selectedImages.size})</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkUnshare}
                      disabled={unshareMutation.isPending}
                      className="text-orange-400 border-orange-400/30 hover:bg-orange-400/10 whitespace-nowrap"
                      data-testid="button-bulk-unshare"
                    >
                      <X className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">
                        {unshareMutation.isPending ? 'Unsharing...' : `Unshare (${selectedImages.size})`}
                      </span>
                      <span className="sm:hidden">({selectedImages.size})</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={deleteMutation.isPending}
                      className="text-red-400 border-red-400/30 hover:bg-red-400/10 whitespace-nowrap"
                      data-testid="button-bulk-delete"
                    >
                      <Trash2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">
                        {deleteMutation.isPending ? 'Deleting...' : `Delete (${selectedImages.size})`}
                      </span>
                      <span className="sm:hidden">({selectedImages.size})</span>
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters Section */}
        {showViewAll && (
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleContent className="space-y-4">
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Character Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Character</label>
                    <Select value={filterCharacter} onValueChange={setFilterCharacter}>
                      <SelectTrigger className="bg-dark-card border-dark-border text-white">
                        <SelectValue placeholder="All characters" />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-dark-border">
                        <SelectItem value="all">All Characters</SelectItem>
                        <SelectItem value="none">No Character</SelectItem>
                        {uniqueCharacters.map(character => (
                          <SelectItem key={character} value={character}>
                            {character}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Scene Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Scene</label>
                    <Select value={filterScene} onValueChange={setFilterScene}>
                      <SelectTrigger className="bg-dark-card border-dark-border text-white">
                        <SelectValue placeholder="All scenes" />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-dark-border">
                        <SelectItem value="all">All Scenes</SelectItem>
                        <SelectItem value="none">No Scene</SelectItem>
                        {uniqueScenes.map(scene => (
                          <SelectItem key={scene} value={scene}>
                            {scene}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Outfit Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Outfit</label>
                    <Select value={filterOutfit} onValueChange={setFilterOutfit}>
                      <SelectTrigger className="bg-dark-card border-dark-border text-white">
                        <SelectValue placeholder="All outfits" />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-dark-border">
                        <SelectItem value="all">All Outfits</SelectItem>
                        <SelectItem value="none">No Outfit</SelectItem>
                        {uniqueOutfits.map(outfit => (
                          <SelectItem key={outfit} value={outfit}>
                            {outfit.length > 30 ? `${outfit.substring(0, 30)}...` : outfit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Date Range</label>
                    <Select value={filterDateRange} onValueChange={setFilterDateRange}>
                      <SelectTrigger className="bg-dark-card border-dark-border text-white">
                        <SelectValue placeholder="All time" />
                      </SelectTrigger>
                      <SelectContent className="bg-dark-card border-dark-border">
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">Last Week</SelectItem>
                        <SelectItem value="month">Last Month</SelectItem>
                        <SelectItem value="year">Last Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Clear Filters Button */}
                {(filterCharacter !== 'all' || filterScene !== 'all' || filterOutfit !== 'all' || filterDateRange !== 'all') && (
                  <div className="mt-4 pt-4 border-t border-dark-border">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFilterCharacter('all');
                        setFilterScene('all');
                        setFilterOutfit('all');
                        setFilterDateRange('all');
                      }}
                      className="text-white border-dark-border hover:bg-dark-border"
                      data-testid="button-clear-filters"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear All Filters
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* No Results Message */}
        {filteredGenerations.length === 0 && completedGenerations.length > 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Filter className="mx-auto h-12 w-12 mb-3" />
              <p>No images match your current filters</p>
              <p className="text-sm">Try adjusting your filter criteria</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setFilterCharacter('all');
                setFilterScene('all');
                setFilterOutfit('all');
                setFilterDateRange('all');
              }}
              className="text-white border-dark-border hover:bg-dark-border"
            >
              Clear All Filters
            </Button>
          </div>
        )}

        <div className={`grid ${getGridClass()} gap-3 sm:gap-4`}>
          {filteredGenerations.map((generation) => {
            const model = getModel(generation.modelId);
            
            return (
              <SwipeableCard
                key={generation.id}
                onDelete={() => handleDelete(generation, { stopPropagation: () => {} } as React.MouseEvent)}
                isMultiSelectMode={isMultiSelectMode}
                className="rounded-lg"
              >
                <div
                  className={`group relative bg-dark-bg rounded-lg overflow-hidden hover:scale-[1.02] transition-all duration-300 cursor-pointer border ${
                    isMultiSelectMode && selectedImages.has(generation.id)
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-dark-border hover:border-slate-600'
                  }`}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleImageSelection(generation.id, { stopPropagation: () => {} } as React.MouseEvent);
                    } else if (onImageClick) {
                      onImageClick(generation);
                    } else {
                      setSelectedGeneration(generation);
                    }
                  }}
                  data-testid={`image-${generation.id}`}
                >
                {/* Image or video - use watermarking endpoint */}
                <div className="aspect-square overflow-hidden relative">
                  {(generation as any).videoUrl ? (
                    <>
                      <video
                        src={(generation as any).videoUrl}
                        poster={(generation as any).videoThumbnailUrl || getWatermarkedImageUrl(generation.id)}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}); }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); }}
                      />
                      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 text-[10px] uppercase tracking-wider text-[hsl(270,100%,75%)] font-[Orbitron,sans-serif] pointer-events-none">
                        Video
                      </div>
                    </>
                  ) : (generation as any).generationType === 'img2vid' ? (
                    // Video job in progress — show source image dimmed with a spinner
                    <>
                      {(generation as any).sourceImageUrl ? (
                        <img
                          src={(generation as any).sourceImageUrl}
                          alt="Source image"
                          className="w-full h-full object-cover opacity-30"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-900" />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                        <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                        <span className="text-xs text-purple-300 font-medium tracking-wide">
                          {generation.status === 'failed' ? '❌ Video failed' : '🎬 Generating video…'}
                        </span>
                        {generation.status === 'failed' && (
                          <span className="text-[10px] text-slate-400 text-center px-4">Credits were refunded</span>
                        )}
                      </div>
                      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 text-[10px] uppercase tracking-wider text-[hsl(270,100%,75%)] font-[Orbitron,sans-serif] pointer-events-none">
                        Video
                      </div>
                    </>
                  ) : (
                    <img
                      src={getDisplayImageUrl(generation)}
                      alt={`Generated: ${generation.prompt.slice(0, 50)}...`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="eager"
                      decoding="async"
                      style={{
                        touchAction: 'auto'
                      }}
                    />
                  )}
                </div>

                {/* Multi-select checkbox */}
                {isMultiSelectMode && (
                  <div className="absolute top-2 left-2">
                    <div
                      className={`w-6 h-6 rounded border-2 transition-all flex items-center justify-center ${
                        selectedImages.has(generation.id)
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-white/50 bg-black/30 backdrop-blur-sm'
                      }`}
                      onClick={(e) => toggleImageSelection(generation.id, e)}
                    >
                      {selectedImages.has(generation.id) && (
                        <CheckSquare className="h-4 w-4 text-white" />
                      )}
                    </div>
                  </div>
                )}

                {/* Overlay Actions — hidden for video cards (play badge is the only affordance) */}
                {!isMultiSelectMode && !(generation as any).videoUrl && (
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className={`backdrop-blur-sm border-white/20 ${
                          isGenerationFavorited(generation.id)
                            ? 'bg-pink-500 bg-opacity-80 hover:bg-pink-600 hover:bg-opacity-90'
                            : 'bg-white bg-opacity-20 hover:bg-opacity-30'
                        }`}
                        onClick={(e) => handleToggleFavorite(generation, e)}
                        disabled={favoriteMutation.isPending || unfavoriteMutation.isPending}
                        data-testid={`button-favorite-${generation.id}`}
                      >
                        <Heart className={`h-4 w-4 ${isGenerationFavorited(generation.id) ? 'fill-current' : ''}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white bg-opacity-20 backdrop-blur-sm hover:bg-opacity-30 border-white/20"
                        onClick={(e) => handleDownload(generation, e)}
                        data-testid={`button-download-${generation.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="bg-green-500 bg-opacity-80 backdrop-blur-sm hover:bg-green-600 hover:bg-opacity-90 border-green-500/20"
                          onClick={(e) => handleOpenSaveToCharacter(generation, e)}
                          data-testid={`button-save-to-character-${generation.id}`}
                          title="Save to Character"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="bg-red-500 bg-opacity-80 backdrop-blur-sm hover:bg-red-600 hover:bg-opacity-90 border-red-500/20"
                        onClick={(e) => handleDelete(generation, e)}
                        data-testid={`button-delete-${generation.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Play badge — always visible; no action buttons compete with it on video cards */}
                {!isMultiSelectMode && (generation as any).videoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="bg-black/55 backdrop-blur-sm rounded-full w-12 h-12 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                )}

                {/* Metadata Footer */}
                {showMetadata && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <div className="text-white">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>{model?.name || 'Unknown Model'}</span>
                        <span>{new Date(generation.createdAt).toLocaleDateString()}</span>
                      </div>
                      {/* Show character and scene in metadata */}
                      {(generation.characterName || generation.sceneName) && (
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          {generation.characterName && (
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              {generation.characterName}
                            </Badge>
                          )}
                          {generation.sceneName && (
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              {generation.sceneName}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Shared and Favorite Indicators */}
                <div className={`absolute top-2 ${isMultiSelectMode ? 'right-2' : 'right-2'} flex flex-col gap-1`}>
                  {isGenerationFavorited(generation.id) && (
                    <Badge 
                      variant="outline"
                      className="text-xs bg-pink-500 text-white border-pink-500"
                    >
                      <Heart className="h-3 w-3 mr-1 fill-current" />
                      Fav
                    </Badge>
                  )}
                  {isGenerationShared(generation.id) && (
                    <Badge 
                      variant="outline"
                      className="text-xs bg-blue-500 text-white border-blue-500"
                    >
                      Shared
                    </Badge>
                  )}
                </div>
                </div>
              </SwipeableCard>
            );
          })}
        </div>
      </div>

      {/* Image Detail Modal */}
      {selectedGeneration && (
        <ImageModal
          generation={selectedGeneration}
          allGenerations={completedGenerations}
          isOpen={!!selectedGeneration}
          onClose={() => setSelectedGeneration(null)}
        />
      )}

      {/* Enhancement Settings Modal */}
      <Dialog open={showEnhancementModal} onOpenChange={setShowEnhancementModal}>
        <DialogContent className="bg-dark-card border-dark-border">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Upscale {selectedImages.size} Image{selectedImages.size > 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {enhancementModel === 'realesrgan' 
                ? 'Upscale your images using AI-powered Real-ESRGAN technology. Each upscale costs 5 Buzz credits.'
                : 'Upscale facial features using GFPGAN face restoration technology. Each upscale costs 5 Buzz credits.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Enhancement Model Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white">Enhancement Model</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setEnhancementModel('realesrgan')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    enhancementModel === 'realesrgan'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-dark-border hover:border-purple-400/50'
                  }`}
                  data-testid="button-model-realesrgan"
                >
                  <div className="text-lg font-bold text-white">Real-ESRGAN</div>
                  <div className="text-xs text-slate-400">General upscaling</div>
                </button>
                <button
                  onClick={() => setEnhancementModel('gfpgan')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    enhancementModel === 'gfpgan'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-dark-border hover:border-purple-400/50'
                  }`}
                  data-testid="button-model-gfpgan"
                >
                  <div className="text-lg font-bold text-white">GFPGAN</div>
                  <div className="text-xs text-slate-400">Face restoration</div>
                </button>
              </div>
            </div>

            {/* Scale Factor Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white">Upscale Factor</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setEnhancementScale(2)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    enhancementScale === 2
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-dark-border hover:border-purple-400/50'
                  }`}
                  data-testid="button-scale-2x"
                >
                  <div className="text-lg font-bold text-white">2x</div>
                  <div className="text-xs text-slate-400">Double resolution</div>
                </button>
                <button
                  onClick={() => setEnhancementScale(4)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    enhancementScale === 4
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-dark-border hover:border-purple-400/50'
                  }`}
                  data-testid="button-scale-4x"
                >
                  <div className="text-lg font-bold text-white">4x</div>
                  <div className="text-xs text-slate-400">Quadruple resolution</div>
                </button>
              </div>
            </div>

            {/* Face Enhancement Toggle - Only for Real-ESRGAN */}
            {enhancementModel === 'realesrgan' && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-dark-bg border border-dark-border">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-white">Face Enhancement</div>
                  <div className="text-xs text-slate-400">
                    Apply additional enhancement to facial features
                  </div>
                </div>
                <button
                  onClick={() => setFaceEnhancement(!faceEnhancement)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    faceEnhancement ? 'bg-purple-500' : 'bg-slate-700'
                  }`}
                  data-testid="toggle-face-enhancement"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      faceEnhancement ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Credit Cost Display */}
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Total Cost:</span>
                <span className="text-lg font-bold text-purple-400">
                  {selectedImages.size * 5} Buzz Credits
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEnhancementModal(false)}
              className="border-dark-border text-slate-400 hover:text-white"
              data-testid="button-cancel-enhancement"
            >
              Cancel
            </Button>
            <Button
              onClick={submitEnhancement}
              disabled={enhancementMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              data-testid="button-confirm-enhancement"
            >
              {enhancementMutation.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Upscale Images
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save to Character Modal (Admin Only) */}
      <Dialog open={showSaveToCharacterModal} onOpenChange={setShowSaveToCharacterModal}>
        <DialogContent className="bg-dark-card border-dark-border max-h-[90vh] overflow-y-auto w-[95vw] max-w-md mx-auto">
          {/* Close button for mobile */}
          <button
            onClick={() => {
              setShowSaveToCharacterModal(false);
              setSaveToCharacterId('');
              setSavePresetName('');
              setGenerationToSave(null);
            }}
            className="absolute right-3 top-3 p-2 rounded-full bg-dark-bg hover:bg-dark-border text-slate-400 hover:text-white transition-colors z-10"
            data-testid="button-close-save-character"
          >
            <X className="h-5 w-5" />
          </button>
          <DialogHeader className="pr-10">
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-400" />
              Save to Character
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Save this generation's settings as a character preset.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Preview thumbnail */}
            {generationToSave?.imageUrl && (
              <div className="flex justify-center">
                <img 
                  src={generationToSave.imageUrl} 
                  alt="Generation preview" 
                  className="max-h-40 rounded-lg border border-dark-border"
                />
              </div>
            )}

            {/* Character Selection */}
            <div className="space-y-2">
              <Label className="text-white">Select Character</Label>
              <Select value={saveToCharacterId} onValueChange={setSaveToCharacterId}>
                <SelectTrigger className="bg-dark-bg border-dark-border text-white">
                  <SelectValue placeholder="Choose a character..." />
                </SelectTrigger>
                <SelectContent className="bg-dark-card border-dark-border">
                  <SelectItem value="new" className="text-green-400 font-medium hover:bg-dark-bg">
                    + Create New Character
                  </SelectItem>
                  {allCharacters.map((character) => (
                    <SelectItem key={character.id} value={character.id} className="text-white hover:bg-dark-bg">
                      {character.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* New Character Name Input */}
            {saveToCharacterId === 'new' && (
              <div className="space-y-2">
                <Label className="text-white">New Character Name</Label>
                <Input 
                  value={newCharacterName}
                  onChange={(e) => setNewCharacterName(e.target.value)}
                  placeholder="e.g. Scarlett"
                  className="bg-dark-bg border-dark-border text-white"
                />
              </div>
            )}

            {/* Preset Name */}
            <div className="space-y-2">
              <Label className="text-white">Preset Name</Label>
              <Input 
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                placeholder="e.g., Beach sunset look"
                className="bg-dark-bg border-dark-border text-white"
                data-testid="input-preset-name"
              />
            </div>

            {/* Update Character Settings Toggle */}
            <div className="flex items-center space-x-3 p-4 rounded-lg bg-dark-bg border border-dark-border">
              <Checkbox 
                id="update-character"
                checked={updateCharacterSettings}
                onCheckedChange={(checked) => setUpdateCharacterSettings(checked === true)}
                className="border-green-500 data-[state=checked]:bg-green-500"
              />
              <div className="space-y-1">
                <Label htmlFor="update-character" className="text-white cursor-pointer">
                  Update character's base settings
                </Label>
                <p className="text-xs text-slate-400">
                  Also update the character's default prompt, model, and image preview from this generation
                </p>
              </div>
            </div>

            {/* Generation Info Summary */}
            {generationToSave && (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-2">
                <div className="text-sm font-medium text-green-400">Settings to be saved:</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>Model: {allModels.find(m => m.id === generationToSave.modelId)?.name || 'Unknown'}</div>
                  <div>Steps: {generationToSave.steps}</div>
                  <div>CFG: {generationToSave.cfgScale}</div>
                  <div>Size: {generationToSave.width}x{generationToSave.height}</div>
                  {generationToSave.seed && <div>Seed: {generationToSave.seed}</div>}
                  {generationToSave.loras && generationToSave.loras.length > 0 && (
                    <div className="col-span-2">LoRAs: {generationToSave.loras.length} configured</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowSaveToCharacterModal(false);
                setSaveToCharacterId('');
                setSavePresetName('');
                setGenerationToSave(null);
              }}
              className="border-dark-border text-slate-400 hover:text-white w-full sm:w-auto"
              data-testid="button-cancel-save-character"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveToCharacter}
              disabled={saveToCharacterMutation.isPending || !saveToCharacterId || (saveToCharacterId === 'new' && !newCharacterName)}
              className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
              data-testid="button-confirm-save-character"
            >
              {saveToCharacterMutation.isPending ? (
                <>
                  <UserPlus className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Save Preset
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
