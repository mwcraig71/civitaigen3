import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Heart, Eye, Download, Users, ArrowLeft, Trash2, Flag, Loader2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { SharedImage, Generation } from '@/types';
import ImageModal from '@/components/image-modal';
import { CharacterEdit } from '@/components/character-edit';

interface PaginatedSharedImagesResponse {
  images: SharedImage[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}

export default function Community() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'likes' | 'views' | 'prompt_az' | 'prompt_za'>('newest');
  const [filterNSFW, setFilterNSFW] = useState<'all' | 'safe' | 'nsfw'>('safe');
  const [filterFeatured, setFilterFeatured] = useState<'all' | 'featured'>('all');
  const [filterOwnership, setFilterOwnership] = useState<'all' | 'mine' | 'liked'>('all');
  const [filterCharacter, setFilterCharacter] = useState<string>('all');
  const [filterScene, setFilterScene] = useState<string>('all');
  const [selectedImage, setSelectedImage] = useState<SharedImage | null>(null);
  const [gridSize, setGridSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [showFilters, setShowFilters] = useState(false);
  const [likedImages, setLikedImages] = useState<Set<string>>(new Set());
  const [allSharedImages, setAllSharedImages] = useState<SharedImage[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [bulkEditCharacterNames, setBulkEditCharacterNames] = useState<Record<string, string>>({});

  // Debounce search term to prevent API calls on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 5000); // 5 second delay

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Deduplication function that prefers images with character names
  const deduplicateImages = useCallback((images: SharedImage[]): SharedImage[] => {
    const imageMap = new Map<string, SharedImage>();
    
    images.forEach(image => {
      // Use image URL as the key for deduplication
      const key = image.imageUrl;
      const existing = imageMap.get(key);
      
      if (!existing) {
        // First occurrence of this image
        imageMap.set(key, image);
      } else {
        // Choose which image to keep - prefer the one with character name
        const hasCharacterName = image.characterName && image.characterName.trim() !== '';
        const existingHasCharacterName = existing.characterName && existing.characterName.trim() !== '';
        
        if (hasCharacterName && !existingHasCharacterName) {
          // New image has character name, existing doesn't - keep new
          imageMap.set(key, image);
        } else if (!hasCharacterName && existingHasCharacterName) {
          // Existing has character name, new doesn't - keep existing
          // Do nothing, existing is already in map
        } else {
          // Both have character names or both don't - keep the first one
          // Do nothing, existing is already in map
        }
      }
    });
    
    return Array.from(imageMap.values());
  }, []);

  // Get thumbnail URL for gallery grid view (smaller, faster loading)
  const getThumbnailUrl = (image: SharedImage) => {
    // If we have a thumbnailUrl from the database, use it
    if (image.thumbnailUrl) {
      // If it's a storage path, serve via API
      if (image.thumbnailUrl.startsWith('/')) {
        return `/api/storage${image.thumbnailUrl}`;
      }
      return image.thumbnailUrl;
    }
    // Fallback to full image URL
    return getImageUrl(image);
  };

  // Get full-size image URL for detail view
  const getImageUrl = (image: SharedImage) => {
    // If we have a generationId, use the same image serving endpoint as main gallery
    if (image.generationId) {
      return `/api/images/${image.generationId}`;
    }
    // Otherwise use the direct imageUrl
    return image.imageUrl;
  };

  const convertSharedImageToGeneration = useCallback((sharedImage: SharedImage): Generation => {
    return {
      id: sharedImage.generationId || sharedImage.id,
      prompt: sharedImage.prompt,
      negativePrompt: sharedImage.negativePrompt || '',
      imageUrl: getImageUrl(sharedImage),
      status: 'completed' as const,
      modelId: undefined, // SharedImage doesn't store modelId
      seed: undefined,
      steps: 28,
      cfgScale: 7 as number,
      width: 832 as number,
      height: 1216 as number,
      scheduler: 'Euler',
      clipSkip: 2,
      quantity: 1,
      loras: [],
      userId: sharedImage.userId,
      createdAt: sharedImage.createdAt,
      // Optional fields that might not exist in SharedImage
      characterId: undefined,
      characterName: undefined,
      sceneName: undefined,
      jobId: undefined,
      storedImagePath: undefined,
      cost: 0,
      blobKey: undefined,
      metadata: undefined,
      storedMetadataPath: undefined,
      originalGenerationData: undefined,
      completedAt: undefined
    };
  }, []);

  // Build query URL based on filters including likedOnly for server-side filtering
  const sharedImagesQueryUrl = useMemo(() => {
    const searchParams = new URLSearchParams();
    
    if (debouncedSearchTerm) searchParams.append('search', debouncedSearchTerm);
    if (filterNSFW !== 'all') searchParams.append('nsfw', (filterNSFW === 'nsfw').toString());
    if (filterFeatured === 'featured') searchParams.append('featured', 'true');
    if (filterCharacter !== 'all') searchParams.append('character', filterCharacter);
    if (filterScene !== 'all') searchParams.append('scene', filterScene);
    if (sortBy) searchParams.append('sort', sortBy);
    if (filterOwnership === 'liked') searchParams.append('likedOnly', 'true');
    if (debouncedSearchTerm) searchParams.append('promptOnly', 'true');
    searchParams.append('limit', '500');
    searchParams.append('offset', '0');
    
    return `/api/shared-images?${searchParams.toString()}`;
  }, [debouncedSearchTerm, filterNSFW, filterFeatured, filterCharacter, filterScene, sortBy, filterOwnership]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: [sharedImagesQueryUrl],
    queryFn: async () => {
      const response = await fetch(sharedImagesQueryUrl);
      if (!response.ok) throw new Error('Failed to fetch shared images');
      return response.json();
    },
  });

  // Fetch available characters and scenes for filter dropdowns
  const { data: availableCharacters = [] } = useQuery<string[]>({
    queryKey: ['/api/shared-images/characters'],
    queryFn: async () => {
      const response = await fetch('/api/shared-images/characters');
      if (!response.ok) throw new Error('Failed to fetch characters');
      return response.json();
    },
  });

  const { data: availableScenes = [] } = useQuery<string[]>({
    queryKey: ['/api/shared-images/scenes'],
    queryFn: async () => {
      const response = await fetch('/api/shared-images/scenes');
      if (!response.ok) throw new Error('Failed to fetch scenes');
      return response.json();
    },
  });


  // Update allSharedImages when initial data loads
  React.useEffect(() => {
    if (paginatedData && offset === 0) {
      const data = paginatedData as PaginatedSharedImagesResponse;
      const deduplicatedImages = deduplicateImages(data.images);
      setAllSharedImages(deduplicatedImages);
      console.log(`🎯 Community Gallery: ${data.images.length} images loaded, ${deduplicatedImages.length} after deduplication`);
    }
  }, [paginatedData, offset]);

  const data = paginatedData as PaginatedSharedImagesResponse;
  const hasMore = data?.hasMore || false;
  const totalImages = data?.total || 0;

  const loadMoreImages = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const newOffset = allSharedImages.length;
      const searchParams = new URLSearchParams();
      
      if (debouncedSearchTerm) searchParams.append('search', debouncedSearchTerm);
      if (filterNSFW !== 'all') searchParams.append('nsfw', (filterNSFW === 'nsfw').toString());
      if (filterFeatured === 'featured') searchParams.append('featured', 'true');
      if (filterCharacter !== 'all') searchParams.append('character', filterCharacter);
      if (filterScene !== 'all') searchParams.append('scene', filterScene);
      if (filterOwnership === 'liked') searchParams.append('likedOnly', 'true');
      // Add promptOnly=true for community search to only search prompt text
      if (debouncedSearchTerm) searchParams.append('promptOnly', 'true');
      searchParams.append('limit', '80');
      searchParams.append('offset', newOffset.toString());
      
      const response = await fetch(`/api/shared-images?${searchParams.toString()}`);
      const data: PaginatedSharedImagesResponse = await response.json();
      
      // Apply deduplication to the combined images
      const combinedImages = [...allSharedImages, ...data.images];
      const deduplicatedImages = deduplicateImages(combinedImages);
      setAllSharedImages(deduplicatedImages);
      setOffset(newOffset);
    } catch (error) {
      console.error('Error loading more shared images:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Fetch user's liked images for toggle state
  const { data: userLikedData } = useQuery<{likedImages: string[]}>({
    queryKey: ['/api/shared-images/liked'],
    queryFn: async () => {
      const response = await fetch('/api/shared-images/liked');
      if (!response.ok) {
        if (response.status === 401) {
          // User not authenticated - return empty array
          return { likedImages: [] };
        }
        throw new Error('Failed to fetch liked images');
      }
      return response.json();
    },
    enabled: !!user, // Only fetch if user is authenticated
  });

  // Update local liked images state when query data changes
  useMemo(() => {
    if (userLikedData?.likedImages) {
      setLikedImages(new Set(userLikedData.likedImages));
    }
  }, [userLikedData]);

  // Mutation for unsharing images
  const unshareMutation = useMutation({
    mutationFn: async (imageId: string) => {
      await apiRequest('DELETE', `/api/shared-images/${imageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      toast({ title: 'Image unshared from community successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to unshare image', variant: 'destructive' });
    },
  });

  // Mutation for reporting/flagging images
  const reportMutation = useMutation({
    mutationFn: async (imageId: string) => {
      await apiRequest('POST', '/api/report', {
        contentType: 'shared_image',
        contentId: imageId,
        reason: 'inappropriate',
        description: 'User reported this image as inappropriate content'
      });
    },
    onSuccess: () => {
      toast({ 
        title: 'Image Reported', 
        description: 'Thank you for reporting this content. Our team will review it shortly.' 
      });
    },
    onError: () => {
      toast({ 
        title: 'Failed to report image', 
        description: 'Please try again later.',
        variant: 'destructive' 
      });
    },
  });

  // Mutation for bulk character editing
  const bulkEditMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const selectedImages = filteredAndSortedImages.filter(img => selectedImageIds.has(img.id));
      const characterName = Object.values(updates)[0]; // For simplified bulk update
      
      // Check if all names are the same for simplified bulk update
      const allSameName = Object.values(updates).every(name => name === characterName);
      
      if (allSameName) {
        // Map to generation IDs for bulk API
        const generationIds = selectedImages.map(img => img.generationId).filter(Boolean);
        if (generationIds.length === selectedImages.length) {
          // All images have generation IDs, use bulk endpoint
          await apiRequest('POST', '/api/generations/bulk-update-character', {
            generationIds,
            characterName
          });
        } else {
          // Fallback to individual updates if some lack generation IDs
          await Promise.all(
            selectedImages.map(img =>
              apiRequest('PUT', `/api/shared-images/${img.id}/character`, { characterName })
            )
          );
        }
      } else {
        // Individual updates for different names using image IDs
        await Promise.all(
          selectedImages.map(img =>
            apiRequest('PUT', `/api/shared-images/${img.id}/character`, { 
              characterName: updates[img.id] 
            })
          )
        );
      }
    },
    onSuccess: () => {
      setShowBulkEditDialog(false);
      setSelectedImageIds(new Set());
      setBulkEditCharacterNames({});
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      toast({ 
        title: 'Character Names Updated', 
        description: 'Successfully updated character names for selected images.' 
      });
    },
    onError: () => {
      toast({ 
        title: 'Failed to update character names', 
        description: 'Please try again later.',
        variant: 'destructive' 
      });
    },
  });

  // Helper functions for multi-select
  const handleImageSelection = (imageId: string, checked: boolean) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(imageId);
      } else {
        newSet.delete(imageId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const ownImages = filteredAndSortedImages.filter(image => image.userId === (user as any)?.id);
    setSelectedImageIds(new Set(ownImages.map(img => img.id)));
  };

  const handleDeselectAll = () => {
    setSelectedImageIds(new Set());
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(!isMultiSelectMode);
    setSelectedImageIds(new Set()); // Clear selections when toggling mode
  };

  const openBulkEditDialog = () => {
    // Initialize character names for selected images
    const selectedImages = filteredAndSortedImages.filter(img => selectedImageIds.has(img.id));
    const initialNames: Record<string, string> = {};
    selectedImages.forEach(img => {
      initialNames[img.id] = img.characterName || '';
    });
    setBulkEditCharacterNames(initialNames);
    setShowBulkEditDialog(true);
  };

  const updateBulkCharacterName = (key: string, newName: string) => {
    setBulkEditCharacterNames(prev => ({
      ...prev,
      [key]: newName
    }));
  };

  // Reset loaded images when filters change (server-side filtering requires fresh data)
  useEffect(() => {
    setOffset(0);
    setAllSharedImages([]);
  }, [filterOwnership, filterNSFW, filterFeatured, filterCharacter, filterScene, debouncedSearchTerm, sortBy]);

  const filteredAndSortedImages = useMemo(() => {
    let filtered = [...allSharedImages];

    // Filter by ownership - only 'mine' needs client-side filtering
    // 'liked' is now handled server-side via likedOnly parameter
    if (filterOwnership === 'mine' && user && typeof user === 'object' && user !== null && 'id' in user) {
      filtered = filtered.filter(image => image.userId === (user as any).id);
    }

    // For prompt sorting, server already sorted the data, so we only apply client-side sorting
    // for non-prompt sorts when ownership filter is applied
    if (filterOwnership === 'mine' && !sortBy.startsWith('prompt_')) {
      filtered.sort((a, b) => {
        switch (sortBy) {
          case 'oldest':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'likes':
            return b.likes - a.likes;
          case 'views':
            return b.views - a.views;
          default: // newest
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
    }

    return filtered;
  }, [allSharedImages, sortBy, filterOwnership, user]);

  // Convert all shared images to Generation format for modal navigation
  const generationsForModal = useMemo(() => {
    return filteredAndSortedImages.map(convertSharedImageToGeneration);
  }, [filteredAndSortedImages, convertSharedImageToGeneration]);

  const handleReuseImage = async (image: SharedImage) => {
    try {
      // Save generation data to localStorage to pre-fill the generator
      const generationData = {
        prompt: image.prompt,
        negativePrompt: image.negativePrompt || '',
        modelId: '', // We might not have the exact model ID
      };

      // Save to localStorage with the same keys the generation panel expects
      Object.entries(generationData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          localStorage.setItem(`generationPanel_${key}`, JSON.stringify(value));
        }
      });

      // Navigate to the generator
      navigate('/generate');

      toast({
        title: "Prompt Loaded",
        description: "The prompt has been loaded into the generator. Ready to create!",
        duration: 2000, // Auto-dismiss after 2 seconds
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load prompt data",
        variant: "destructive",
      });
    }
  };

  // Handle character name updates
  const handleCharacterUpdate = (imageId: string, characterName: string | null) => {
    // Update the local allSharedImages state to reflect the change immediately
    setAllSharedImages(prevImages => 
      prevImages.map(img => 
        img.id === imageId 
          ? { ...img, characterName } 
          : img
      )
    );
  };

  const handleLikeImage = async (imageId: string) => {
    try {
      const res = await apiRequest('POST', `/api/shared-images/${imageId}/like`);
      const response = await res.json() as any;
      
      // Update local liked state based on API response
      setLikedImages(prev => {
        const newSet = new Set(prev);
        if (response.isLiked) {
          newSet.add(imageId);
        } else {
          newSet.delete(imageId);
        }
        return newSet;
      });
      
      // Invalidate all shared-images queries using predicate matching
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/shared-images');
        }
      });
      
      toast({
        title: response.isLiked ? "Liked!" : "Unliked!",
        description: response.isLiked ? "Image liked successfully" : "Image unliked successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle like",
        variant: "destructive",
      });
    }
  };

  const handleDownloadImage = async (imageId: string, imageUrl: string, sharedImage?: SharedImage) => {
    try {
      // Track the download
      await apiRequest('POST', `/api/shared-images/${imageId}/download`);
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });

      // Use the video URL directly when available; fall back to the image URL
      const isVideo = !!(sharedImage?.videoUrl);
      const downloadUrl = isVideo ? sharedImage!.videoUrl! : imageUrl;
      const fileName = isVideo
        ? `community-video-${imageId}.mp4`
        : `community-image-${imageId}.jpg`;

      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to fetch media');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Downloaded!",
        description: isVideo ? "Video downloaded successfully" : "Image downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download",
        variant: "destructive",
      });
    }
  };

  const getGridClass = () => {
    switch (gridSize) {
      case 'small': return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5';
      case 'large': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      default: return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading community images...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back Button */}
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/generate')}
          className="flex items-center gap-2 text-slate-400 hover:text-white"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-green-500" />
            Community Gallery
          </h1>
          <p className="text-slate-400 mt-2">
            Discover amazing images and prompts shared by the community - Free AI Porn
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={gridSize} onValueChange={(value: any) => setGridSize(value)}>
            <SelectTrigger className="w-32" data-testid="select-grid-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              key="community-search-input"
              placeholder="Search prompts, titles, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          
          {user && (
            <Button
              variant={isMultiSelectMode ? "default" : "outline"}
              onClick={toggleMultiSelectMode}
              className="flex items-center gap-2"
              data-testid="button-toggle-multiselect"
              aria-pressed={isMultiSelectMode}
            >
              {isMultiSelectMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {isMultiSelectMode ? 'Exit Select' : 'Select Mode'}
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-4 p-4 bg-dark-bg rounded-lg border border-dark-border">
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Sort by</label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-40" data-testid="select-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="likes">Most Liked</SelectItem>
                  <SelectItem value="views">Most Viewed</SelectItem>
                  <SelectItem value="prompt_az">Prompt A→Z</SelectItem>
                  <SelectItem value="prompt_za">Prompt Z→A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Content</label>
              <Select value={filterNSFW} onValueChange={(value: any) => setFilterNSFW(value)}>
                <SelectTrigger className="w-32" data-testid="select-content-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="safe">Safe</SelectItem>
                  <SelectItem value="nsfw">NSFW</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Featured</label>
              <Select value={filterFeatured} onValueChange={(value: any) => setFilterFeatured(value)}>
                <SelectTrigger className="w-32" data-testid="select-featured-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="featured">Featured</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Character</label>
              <Select value={filterCharacter} onValueChange={(value: any) => setFilterCharacter(value)}>
                <SelectTrigger className="w-40" data-testid="select-character-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Characters</SelectItem>
                  {availableCharacters.map((character) => (
                    <SelectItem key={character} value={character}>
                      {character}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Scene</label>
              <Select value={filterScene} onValueChange={(value: any) => setFilterScene(value)}>
                <SelectTrigger className="w-40" data-testid="select-scene-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scenes</SelectItem>
                  {availableScenes.map((scene) => (
                    <SelectItem key={scene} value={scene}>
                      {scene}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {user && typeof user === 'object' && user !== null && 'id' in user ? (
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Ownership</label>
                <Select value={filterOwnership} onValueChange={(value: any) => setFilterOwnership(value)}>
                  <SelectTrigger className="w-32" data-testid="select-ownership-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Images</SelectItem>
                    <SelectItem value="mine">My Images</SelectItem>
                    <SelectItem value="liked">Favorites</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Images Grid */}
      {filteredAndSortedImages.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-dark-bg rounded-full mx-auto mb-6 flex items-center justify-center">
            <Users className="h-10 w-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-medium mb-3 text-white">No community images found</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            {searchTerm 
              ? "Try adjusting your search or filters to find more images."
              : "Be the first to share your amazing creations with the community!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">
              Showing {allSharedImages.length} of {totalImages} community images
              {filteredAndSortedImages.length !== allSharedImages.length && ` (${filteredAndSortedImages.length} filtered)`}
            </p>
          </div>
          
          {/* Bulk Action Bar */}
          {isMultiSelectMode && selectedImageIds.size > 0 && (
            <div className="flex items-center justify-between p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <div className="flex items-center gap-4">
                <span className="text-blue-300 font-medium">
                  {selectedImageIds.size} image{selectedImageIds.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  Select All Mine
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  data-testid="button-deselect-all"
                >
                  Deselect All
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={openBulkEditDialog}
                  data-testid="button-bulk-edit-character"
                >
                  Edit Character Names
                </Button>
              </div>
            </div>
          )}
          
          <div className={`grid ${getGridClass()} gap-3 sm:gap-4`}>
            {filteredAndSortedImages.map((image: SharedImage) => (
              <div
                key={image.id}
                className={`group relative bg-dark-bg rounded-lg overflow-hidden hover:scale-[1.02] transition-all duration-300 border ${
                  selectedImageIds.has(image.id) 
                    ? 'border-blue-500 ring-2 ring-blue-500/50' 
                    : 'border-dark-border hover:border-slate-600'
                }`}
                data-testid={`community-image-${image.id}`}
              >
                {/* Image */}
                <div 
                  className="aspect-square overflow-hidden cursor-pointer relative"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Handle checkbox click in multi-select mode
                    if (isMultiSelectMode && image.userId === (user as any)?.id) {
                      const isChecked = selectedImageIds.has(image.id);
                      handleImageSelection(image.id, !isChecked);
                      return;
                    }
                    
                    console.log('🖱️ Community image clicked:', image.id, image);
                    
                    // Track the view
                    try {
                      await apiRequest('POST', `/api/shared-images/${image.id}/view`);
                      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
                    } catch (error) {
                      console.error('Failed to track view:', error);
                    }
                    
                    setSelectedImage(image);
                    console.log('🖼️ Selected image state set to:', image.id);
                  }}
                  data-testid={`image-${image.id}`}
                >
                  {/* Selection Checkbox for owner's images in multi-select mode */}
                  {isMultiSelectMode && image.userId === (user as any)?.id && (
                    <div 
                      className="absolute top-2 right-2 z-10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const isChecked = selectedImageIds.has(image.id);
                        handleImageSelection(image.id, !isChecked);
                      }}
                    >
                      <Checkbox
                        checked={selectedImageIds.has(image.id)}
                        onCheckedChange={(checked) => handleImageSelection(image.id, checked as boolean)}
                        className="w-6 h-6 bg-white/95 border-2 border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white shadow-lg"
                        data-testid={`checkbox-select-${image.id}`}
                      />
                    </div>
                  )}
                  
                  {/* Multi-select mode overlay for non-owned images */}
                  {isMultiSelectMode && image.userId !== (user as any)?.id && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-5">
                      <span className="text-white/70 text-sm font-medium bg-black/50 px-2 py-1 rounded">
                        Not your image
                      </span>
                    </div>
                  )}
                  
                  <img
                    src={getThumbnailUrl(image)}
                    alt={image.title || `Community image: ${image.prompt.slice(0, 50)}...`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                    style={{
                      touchAction: 'auto'
                    }}
                    onError={(e) => {
                      // Fallback to full image URL if thumbnail fails
                      const target = e.target as HTMLImageElement;
                      if (target.src !== getImageUrl(image)) {
                        target.src = getImageUrl(image);
                      }
                    }}
                  />
                  {/* Video badge */}
                  {image.videoUrl && (
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white rounded-full px-1.5 py-0.5 text-xs flex items-center gap-1 pointer-events-none">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M8 5v14l11-7z"/></svg>
                      Video
                    </div>
                  )}
                  {/* Click to view overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center pointer-events-none">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black bg-opacity-75 text-white px-3 py-1 rounded-full text-sm font-medium">
                        Click to view
                      </div>
                    </div>
                  </div>
                </div>

                {/* NSFW Badge */}
                {image.isNSFW ? (
                  <div className="absolute top-2 left-2">
                    <Badge variant="destructive" className="text-xs">
                      NSFW
                    </Badge>
                  </div>
                ) : null}

                {/* Featured Badge */}
                {image.featured && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="default" className="text-xs bg-yellow-500">
                      Featured
                    </Badge>
                  </div>
                )}

                {/* Owner Badge */}
                {user && typeof user === 'object' && user !== null && 'id' in user && (user as any).id === image.userId && (
                  <div className="absolute top-2 left-2 ml-16">
                    <Badge variant="outline" className="text-xs bg-blue-500 text-white border-blue-500">
                      Your Image
                    </Badge>
                  </div>
                )}

                {/* Overlay Actions */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all flex items-end justify-center pb-4 pointer-events-none">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2 pointer-events-auto">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReuseImage(image);
                      }}
                      className="bg-primary-500 hover:bg-primary-600 text-white"
                      data-testid={`button-reuse-${image.id}`}
                    >
                      Reuse
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLikeImage(image.id);
                      }}
                      className={likedImages.has(image.id) ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"}
                      data-testid={`button-like-${image.id}`}
                    >
                      <Heart className={`h-4 w-4 ${likedImages.has(image.id) ? 'fill-current' : ''}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadImage(image.id, getImageUrl(image), image);
                      }}
                      className="bg-green-500 hover:bg-green-600 text-white"
                      data-testid={`button-download-${image.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    
                    {/* Character Edit - Only for owner images */}
                    {user && typeof user === 'object' && user !== null && 'id' in user && (user as any).id === image.userId && (
                      <CharacterEdit
                        imageId={image.id}
                        initialCharacterName={image.characterName}
                        availableCharacters={availableCharacters}
                        isOwner={true}
                        onUpdated={(characterName) => handleCharacterUpdate(image.id, characterName)}
                        className="pointer-events-auto"
                      />
                    )}
                    {/* Show flag button for other users' images */}
                    {(!user || !(typeof user === 'object' && user !== null && 'id' in user) || (user as any).id !== image.userId) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          reportMutation.mutate(image.id);
                        }}
                        disabled={reportMutation.isPending}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white"
                        data-testid={`button-flag-${image.id}`}
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {/* Show unshare button only for user's own images */}
                    {user && typeof user === 'object' && user !== null && 'id' in user && (user as any).id === image.userId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          unshareMutation.mutate(image.id);
                        }}
                        disabled={unshareMutation.isPending}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                        data-testid={`button-unshare-${image.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Image Info */}
                <div className="p-3 space-y-2">
                  {image.title && (
                    <h4 className="font-medium text-white text-sm truncate" data-testid={`text-title-${image.id}`}>
                      {image.title}
                    </h4>
                  )}
                  
                  <div className="space-y-1">
                    {image.characterName && (
                      <p className="text-xs text-blue-400 font-medium" data-testid={`text-character-${image.id}`}>
                        Character: {image.characterName}
                      </p>
                    )}
                    {image.sceneName && (
                      <p className="text-xs text-green-400 font-medium" data-testid={`text-scene-${image.id}`}>
                        Scene: {image.sceneName}
                      </p>
                    )}
                    {!image.characterName && !image.sceneName && (
                      <p className="text-xs text-slate-400 line-clamp-2" data-testid={`text-prompt-${image.id}`}>
                        {image.prompt}
                      </p>
                    )}
                  </div>
                  
                  {image.tags && Array.isArray(image.tags) && image.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {image.tags.slice(0, 3).map((tag: string, index: number) => (
                        <Badge key={`${tag}-${index}`} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {image.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{image.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {image.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {image.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {image.downloads}
                      </span>
                    </div>
                    <span>{new Date(image.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Load More Button */}
          {hasMore && allSharedImages.length > 0 && (
            <div className="flex justify-center mt-8">
              <Button 
                onClick={loadMoreImages}
                disabled={isLoadingMore}
                size="lg"
                variant="outline"
                className="bg-dark-card border-dark-border text-white hover:bg-slate-700"
                data-testid="button-load-more"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading more images...
                  </>
                ) : (
                  `Load More Images (${totalImages - allSharedImages.length} remaining)`
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Image Detail Modal */}
      {selectedImage && (
        <>
          {console.log('🖼️ Rendering modal for image:', selectedImage.id)}
          <ImageModal
            generation={convertSharedImageToGeneration(selectedImage)}
            allGenerations={generationsForModal}
            isOpen={!!selectedImage}
            onClose={() => {
              console.log('🔒 Modal closing');
              setSelectedImage(null);
            }}
          />
        </>
      )}

      {/* Bulk Character Edit Dialog */}
      <Dialog open={showBulkEditDialog} onOpenChange={setShowBulkEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Character Names</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Update character names for {selectedImageIds.size} selected image{selectedImageIds.size !== 1 ? 's' : ''}
            </p>
            
            <div className="space-y-3">
              {filteredAndSortedImages
                .filter(img => selectedImageIds.has(img.id))
                .map(image => {
                  const key = image.generationId || image.id;
                  return (
                    <div key={image.id} className="flex items-center gap-3 p-3 bg-dark-bg rounded-lg border border-dark-border">
                      <img
                        src={getThumbnailUrl(image)}
                        alt={image.title || 'Community image'}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-slate-300 mb-2">
                          {image.prompt.slice(0, 60)}...
                        </p>
                        <Input
                          placeholder="Character name"
                          value={bulkEditCharacterNames[key] || ''}
                          onChange={(e) => updateBulkCharacterName(key, e.target.value)}
                          className="w-full"
                          data-testid={`input-character-name-${image.id}`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkEditDialog(false)}
              data-testid="button-cancel-bulk-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={() => bulkEditMutation.mutate(bulkEditCharacterNames)}
              disabled={bulkEditMutation.isPending}
              data-testid="button-save-bulk-edit"
            >
              {bulkEditMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}