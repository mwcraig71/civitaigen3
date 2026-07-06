import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Search, Grid3X3, Grid, LayoutGrid, Filter, SortDesc, Heart, Images, X, Copy, ChevronLeft, ChevronRight, RotateCcw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import ImageGallery from '@/components/image-gallery';
import { Generation, SharedImage } from '@/types';

export default function Favorites() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'cost'>('newest');
  const [gridSize, setGridSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [activeTab, setActiveTab] = useState<'generations' | 'liked'>('generations');
  const [likedImages, setLikedImages] = useState<Set<string>>(new Set());
  
  // Modal state for liked images
  const [selectedSharedImage, setSelectedSharedImage] = useState<SharedImage | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  const { data: favoriteGenerations = [], isLoading: isLoadingGenerations } = useQuery<Generation[]>({
    queryKey: ['/api/favorites/generations'],
    refetchInterval: false, // No background polling - data is static favorites
    staleTime: 60000, // Consider data fresh for 1 minute
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  // Fetch user's liked images
  const { data: userLikedData } = useQuery<{likedImages: string[]}>({
    queryKey: ['/api/shared-images/liked'],
    queryFn: async () => {
      const response = await fetch('/api/shared-images/liked', {
        credentials: 'include'  // Ensure cookies are sent with the request
      });
      if (!response.ok) {
        if (response.status === 401) {
          return { likedImages: [] };
        }
        throw new Error('Failed to fetch liked images');
      }
      return response.json();
    },
    refetchInterval: false, // No background polling - likes are updated via mutations
    refetchOnWindowFocus: true, // Refetch when user comes back to the page
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // Fetch shared images data to display liked images with full details
  const { data: sharedImagesData = [], isLoading: isLoadingShared } = useQuery<SharedImage[]>({
    queryKey: ['/api/shared-images'],
    queryFn: async () => {
      const response = await fetch('/api/shared-images', {
        credentials: 'include'  // Ensure cookies are sent with the request
      });
      if (!response.ok) throw new Error('Failed to fetch shared images');
      const data = await response.json();
      return data.images || [];
    },
    refetchInterval: false, // No background polling - shared images are fairly static
    refetchOnWindowFocus: true, // Refetch when user comes back to the page
    staleTime: 60000, // Consider data fresh for 1 minute
  });

  // Update local liked images state when query data changes
  useMemo(() => {
    if (userLikedData?.likedImages) {
      setLikedImages(new Set(userLikedData.likedImages));
    }
  }, [userLikedData]);

  const filteredGenerations = favoriteGenerations
    .filter(gen => {
      const matchesSearch = gen.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        gen.negativePrompt?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'cost':
          return b.cost - a.cost;
        default: // newest
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  // Filter liked images that user has actually liked
  const likedSharedImages = useMemo(() => {
    return sharedImagesData
      .filter(image => likedImages.has(image.id))
      .filter(image => {
        if (activeTab !== 'liked') return true;
        const matchesSearch = image.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
          image.negativePrompt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          image.characterName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          image.sceneName?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'oldest':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          default: // newest (cost doesn't apply to shared images)
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [sharedImagesData, likedImages, activeTab, searchTerm, sortBy]);

  const isLoading = activeTab === 'generations' ? isLoadingGenerations : isLoadingShared;

  // Modal handlers for liked images
  const openModal = (image: SharedImage, index: number) => {
    setSelectedSharedImage(image);
    setCurrentImageIndex(index);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSharedImage(null);
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentImageIndex > 0) {
      const newIndex = currentImageIndex - 1;
      setCurrentImageIndex(newIndex);
      setSelectedSharedImage(likedSharedImages[newIndex]);
    } else if (direction === 'next' && currentImageIndex < likedSharedImages.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      setSelectedSharedImage(likedSharedImages[newIndex]);
    }
  };

  const copyPrompt = () => {
    if (selectedSharedImage?.prompt) {
      navigator.clipboard.writeText(selectedSharedImage.prompt);
      toast({
        title: "Copied to clipboard",
        description: "Prompt has been copied to your clipboard.",
      });
    }
  };

  const handleReuse = () => {
    if (!selectedSharedImage) return;

    // Save all generation data to localStorage with the same keys the generation panel uses
    const generationData = {
      modelId: '', // We'll need to handle model lookup separately since we only have modelUsed name
      prompt: selectedSharedImage.prompt || '',
      negativePrompt: selectedSharedImage.negativePrompt || '',
      seed: selectedSharedImage.seed || -1,
      steps: selectedSharedImage.steps || 34,
      cfgScale: selectedSharedImage.cfgScale || 7,
      width: selectedSharedImage.width || 832,
      height: selectedSharedImage.height || 1216,
      scheduler: selectedSharedImage.scheduler || 'Euler',
      clipSkip: selectedSharedImage.clipSkip || 2,
      quantity: 1,
      loras: selectedSharedImage.loras || [],
      characterId: '', // We might not have character ID for shared images
    };

    // Save to localStorage with the same keys the generation panel expects
    Object.entries(generationData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        localStorage.setItem(`generationPanel_${key}`, JSON.stringify(value));
      }
    });

    // Trigger storage events for better detection
    Object.entries(generationData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        window.dispatchEvent(new StorageEvent('storage', {
          key: `generationPanel_${key}`,
          newValue: JSON.stringify(value),
          oldValue: localStorage.getItem(`generationPanel_${key}`),
          storageArea: localStorage
        }));
      }
    });

    // Trigger custom event for more reliable detection
    window.dispatchEvent(new CustomEvent('generationDataUpdated', {
      detail: { generationData, source: 'favoritesModal' }
    }));

    // Close modal and navigate
    closeModal();
    navigate('/generate');

    // Show success toast
    setTimeout(() => {
      toast({
        title: "Settings Applied",
        description: "Generation settings have been loaded into the generator. Ready to create!",
        duration: 2000,
      });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      {/* Header with Back Button */}
      <div className="border-b border-dark-border bg-dark-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Mobile and desktop responsive layout */}
          <div className="space-y-4">
            {/* Top row - Back button and title */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link href="/generate">
                  <Button variant="ghost" size="sm" data-testid="button-back-home">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Back to Generator</span>
                    <span className="sm:hidden">Back</span>
                  </Button>
                </Link>
                <div className="flex items-center space-x-2">
                  <Heart className="h-5 w-5 text-red-500" />
                  <h1 className="text-xl sm:text-2xl font-bold">My Favorites</h1>
                </div>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="flex space-x-1 border-b border-dark-border">
              <button
                onClick={() => setActiveTab('generations')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'generations'
                    ? 'text-white bg-dark-bg border-b-2 border-primary-500'
                    : 'text-slate-400 hover:text-white hover:bg-dark-bg/50'
                }`}
                data-testid="tab-generations"
              >
                <div className="flex items-center space-x-2">
                  <Images className="h-4 w-4" />
                  <span>Generated Images</span>
                  <span className="text-xs text-slate-500">({favoriteGenerations.length})</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('liked')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'liked'
                    ? 'text-white bg-dark-bg border-b-2 border-primary-500'
                    : 'text-slate-400 hover:text-white hover:bg-dark-bg/50'
                }`}
                data-testid="tab-liked"
              >
                <div className="flex items-center space-x-2">
                  <Heart className="h-4 w-4" />
                  <span>Liked Images</span>
                  <span className="text-xs text-slate-500">({likedSharedImages.length})</span>
                </div>
              </button>
            </div>
            
            {/* Second row - Search and controls */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              {/* Search - full width on mobile */}
              <div className="relative flex-1 sm:flex-initial">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search favorites..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-80 bg-dark-bg border-dark-border text-white"
                  data-testid="input-search-favorites"
                />
              </div>

              {/* Controls - stack on mobile, row on desktop */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                {/* Sort */}
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <SortDesc className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <Select value={sortBy} onValueChange={(value: 'newest' | 'oldest' | 'cost') => setSortBy(value)}>
                    <SelectTrigger className="w-full sm:w-32 bg-dark-bg border-dark-border text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                      <SelectItem value="cost">Cost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Grid size */}
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <LayoutGrid className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <Select value={gridSize} onValueChange={(value: 'small' | 'medium' | 'large') => setGridSize(value)}>
                    <SelectTrigger className="w-full sm:w-32 bg-dark-bg border-dark-border text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">
                        <div className="flex items-center">
                          <Grid3X3 className="h-3 w-3 mr-2" />
                          Small
                        </div>
                      </SelectItem>
                      <SelectItem value="medium">
                        <div className="flex items-center">
                          <Grid className="h-3 w-3 mr-2" />
                          Medium
                        </div>
                      </SelectItem>
                      <SelectItem value="large">
                        <div className="flex items-center">
                          <LayoutGrid className="h-3 w-3 mr-2" />
                          Large
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : activeTab === 'generations' ? (
          // Generated Images Tab Content
          favoriteGenerations.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">No favorites yet</h3>
              <p className="text-slate-400 mb-6">
                Start favoriting your best generations to see them here.
              </p>
              <Link href="/">
                <Button variant="outline" className="border-primary-500 text-primary-500 hover:bg-primary-500 hover:bg-opacity-10">
                  Generate Images
                </Button>
              </Link>
            </div>
          ) : filteredGenerations.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">No matching favorites</h3>
              <p className="text-slate-400">
                Try adjusting your search terms or filters.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-slate-300">
                  {filteredGenerations.length} favorite{filteredGenerations.length === 1 ? '' : 's'}
                  {searchTerm && ` matching "${searchTerm}"`}
                </h2>
              </div>
              
              <ImageGallery 
                generations={filteredGenerations}
                gridCols={gridSize}
                showMetadata={true}
                allowMultiSelect={true}
              />
            </>
          )
        ) : (
          // Liked Images Tab Content
          likedSharedImages.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">No liked images yet</h3>
              <p className="text-slate-400 mb-6">
                Start liking community images to see them here.
              </p>
              <Link href="/community">
                <Button variant="outline" className="border-primary-500 text-primary-500 hover:bg-primary-500 hover:bg-opacity-10">
                  Browse Community
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-slate-300">
                  {likedSharedImages.length} liked image{likedSharedImages.length === 1 ? '' : 's'}
                  {searchTerm && ` matching "${searchTerm}"`}
                </h2>
              </div>
              
              {/* Liked Images Grid */}
              <div className={`grid gap-3 sm:gap-4 ${
                gridSize === 'small' ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10' :
                gridSize === 'medium' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' :
                'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
              }`}>
                {likedSharedImages.map((image: SharedImage, index: number) => (
                  <div
                    key={image.id}
                    className="group relative bg-dark-bg rounded-lg overflow-hidden hover:scale-[1.02] transition-all duration-300 border border-dark-border hover:border-slate-600 cursor-pointer"
                    data-testid={`liked-image-${image.id}`}
                    onClick={() => openModal(image, index)}
                  >
                    <div className="aspect-square overflow-hidden relative">
                      <img 
                        src={`/api/shared-images/${image.id}/image`}
                        alt={image.prompt}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      
                      {/* Character Badge */}
                      {image.characterName && (
                        <div className="absolute top-2 left-2">
                          <span className="text-xs bg-black/70 text-white px-2 py-1 rounded-full">
                            {image.characterName}
                          </span>
                        </div>
                      )}
                      
                      {/* Stats Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="flex items-center justify-between text-xs text-white">
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-1">
                              <Heart className="h-3 w-3 fill-current text-red-500" />
                              <span>{image.likes}</span>
                            </div>
                          </div>
                          <span>{new Date(image.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>

      {/* Liked Images Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[90vh] bg-dark-bg border-dark-border p-0 overflow-hidden">
          {selectedSharedImage && (
            <div className="relative h-full w-full flex">
              {/* Close Button */}
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10 p-0"
                onClick={closeModal}
              >
                <X className="h-5 w-5" />
              </Button>

              {/* Navigation Arrows */}
              {likedSharedImages.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10 p-0"
                    onClick={() => navigateImage('prev')}
                    disabled={currentImageIndex === 0}
                    data-testid="prev-image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10 p-0"
                    onClick={() => navigateImage('next')}
                    disabled={currentImageIndex === likedSharedImages.length - 1}
                    data-testid="next-image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              {/* Image Counter */}
              {likedSharedImages.length > 1 && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  {currentImageIndex + 1} of {likedSharedImages.length}
                </div>
              )}

              {/* Image Section */}
              <div className="flex-1 relative bg-black flex items-center justify-center">
                <img
                  src={`/api/shared-images/${selectedSharedImage.id}/image`}
                  alt={selectedSharedImage.prompt}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* Details Panel */}
              <div className="w-96 bg-dark-card border-l border-dark-border flex flex-col">
                <div className="p-4 border-b border-dark-border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-white">Image Details</h3>
                    <div className="text-sm text-slate-400">
                      {currentImageIndex + 1} of {likedSharedImages.length}
                    </div>
                  </div>
                  
                  {/* Character Name */}
                  {selectedSharedImage.characterName && (
                    <div className="mb-2">
                      <span className="inline-block bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-sm">
                        {selectedSharedImage.characterName}
                      </span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center space-x-4 text-sm text-slate-400">
                    <div className="flex items-center space-x-1">
                      <Heart className="h-4 w-4 fill-current text-red-500" />
                      <span>{selectedSharedImage.likes}</span>
                    </div>
                    <span>{new Date(selectedSharedImage.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
                  {/* Prompt Section */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                        PROMPT
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={copyPrompt}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="text-sm text-slate-300 bg-dark-bg rounded p-3 max-h-48 overflow-y-auto">
                      {selectedSharedImage.prompt}
                    </div>
                  </div>

                  {/* Model Information */}
                  {selectedSharedImage.modelUsed && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-2">
                        MODEL
                      </h4>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-sm text-slate-300">
                          {selectedSharedImage.modelUsed}
                        </div>
                        <span className="inline-block bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-xs">
                          Pony
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Technical Details Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {selectedSharedImage.steps && (
                      <div>
                        <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-1">
                          STEPS
                        </h4>
                        <div className="text-xl font-semibold text-white">
                          {selectedSharedImage.steps}
                        </div>
                      </div>
                    )}
                    
                    {selectedSharedImage.cfgScale && (
                      <div>
                        <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-1">
                          CFG SCALE
                        </h4>
                        <div className="text-xl font-semibold text-white">
                          {selectedSharedImage.cfgScale}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-1">
                        SIZE
                      </h4>
                      <div className="text-xl font-semibold text-white">
                        {selectedSharedImage.width || 832}×{selectedSharedImage.height || 1216}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-1">
                        SEED
                      </h4>
                      <div className="text-xl font-semibold text-white">
                        {selectedSharedImage.seed || -1}
                      </div>
                    </div>
                  </div>

                  {/* Image ID (Use as Seed) */}
                  {selectedSharedImage.seed && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-2">
                        IMAGE ID (USE AS SEED)
                      </h4>
                      <div className="bg-dark-bg rounded p-3 border border-green-500/30">
                        <div className="text-green-400 font-mono text-sm">
                          {selectedSharedImage.id.substring(0, 32)}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-green-400 hover:text-green-300 mt-2 p-0 h-auto"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedSharedImage.seed?.toString() || '');
                            toast({
                              title: "Copied to clipboard",
                              description: "Seed has been copied to your clipboard.",
                            });
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy as Seed
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Scheduler and Clip Skip */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-1">
                        SCHEDULER
                      </h4>
                      <div className="text-sm text-white">
                        {selectedSharedImage.scheduler || 'EulerA'}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-1">
                        CLIP SKIP
                      </h4>
                      <div className="text-sm text-white">
                        {selectedSharedImage.clipSkip || 2}
                      </div>
                    </div>
                  </div>

                  {/* LoRAs Used */}
                  {selectedSharedImage.loras && selectedSharedImage.loras.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-2">
                        LORAS USED
                      </h4>
                      <div className="space-y-2">
                        {selectedSharedImage.loras.map((lora, index) => (
                          <div key={index} className="bg-dark-bg rounded p-3 border border-dark-border">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-white">{lora.name}</div>
                              <div className="text-sm font-medium text-white">
                                {lora.strength >= 0 ? '+' : ''}{lora.strength.toFixed(1)}
                              </div>
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              STRENGTH
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Negative Prompt Section */}
                  {selectedSharedImage.negativePrompt && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-2">
                        NEGATIVE PROMPT
                      </h4>
                      <div className="text-sm text-slate-300 bg-dark-bg rounded p-3 max-h-32 overflow-y-auto">
                        {selectedSharedImage.negativePrompt}
                      </div>
                    </div>
                  )}

                  {/* Scene Information */}
                  {selectedSharedImage.sceneName && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-2">
                        SCENE
                      </h4>
                      <div className="text-sm text-slate-300">
                        {selectedSharedImage.sceneName}
                      </div>
                    </div>
                  )}

                  {/* Created Date */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-2">
                      CREATED
                    </h4>
                    <div className="text-sm text-slate-300">
                      {new Date(selectedSharedImage.createdAt).toLocaleDateString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <Button
                      onClick={handleReuse}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-reuse-generator"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reuse in Generator
                    </Button>
                    
                    <Button
                      variant="outline"
                      className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                      data-testid="button-download-image"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Image
                    </Button>
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}