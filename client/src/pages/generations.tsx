import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Calendar, Search, Grid3X3, Grid, LayoutGrid, Filter, SortDesc, Loader2, Trash2, AlertTriangle, Sparkles, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import ImageGallery from '@/components/image-gallery';
import { Generation } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/hooks/useAuth';

interface PaginatedGenerationsResponse {
  generations: Generation[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}

export default function Generations() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'cost'>('newest');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [filterFavorites, setFilterFavorites] = useState<'all' | 'favorites'>('all');
  const [gridSize, setGridSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [allGenerations, setAllGenerations] = useState<Generation[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Cleanup dialog state
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [selectedForCleanup, setSelectedForCleanup] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: wsUser } = useAuth();
  const { messageQueue } = useWebSocket(wsUser?.id ?? null);
  // Latest message; this listener previously destructured a non-existent
  // `lastMessage` from the hook, so gallery insta-refresh never fired.
  const lastMessage = messageQueue.length > 0 ? messageQueue[messageQueue.length - 1] : null;
  
  // Listen for WebSocket messages to instantly refresh gallery when images complete
  useEffect(() => {
    if (!lastMessage) {
      console.log('🔄 Gallery: No WebSocket message yet');
      return;
    }
    
    console.log('🔄 Gallery: Received WebSocket message:', lastMessage.type);
    
    // Force refetch gallery cache when images arrive
    if (lastMessage.type === 'generation_image_ready' || lastMessage.type === 'generation_batch_complete') {
      console.log('✨ Gallery: NEW IMAGE DETECTED! Force refetching gallery NOW...');
      
      // Force immediate refetch of all active generation queries
      // Using predicate to match any query starting with /api/generations
      queryClient.refetchQueries({ 
        predicate: (query) => {
          const key = String(query.queryKey[0] || '');
          return key.startsWith('/api/generations');
        },
        type: 'active' // Only refetch active queries
      });
    }
  }, [lastMessage, queryClient]);
  
  // Build query URL based on favorites filter
  const generationsQueryUrl = filterFavorites === 'favorites' 
    ? '/api/generations?limit=80&offset=0&favoritesOnly=true'
    : '/api/generations?limit=80&offset=0';
  
  const { data: paginatedData, isLoading } = useQuery({
    queryKey: [generationsQueryUrl],
    // WebSocket handles real-time updates for new images
    // No refetchInterval needed - avoids race conditions during deletions
  });

  // Reset offset and allGenerations when filter changes
  React.useEffect(() => {
    setOffset(0);
    setAllGenerations([]);
  }, [filterFavorites]);

  // Update allGenerations when initial data loads
  React.useEffect(() => {
    if (paginatedData && offset === 0) {
      const data = paginatedData as PaginatedGenerationsResponse;
      setAllGenerations(data.generations);
    }
  }, [paginatedData, offset]);

  const data = paginatedData as PaginatedGenerationsResponse;
  const hasMore = data?.hasMore || false;
  const totalGenerations = data?.total || 0;

  // Query to fetch unshared generations (private images not shared to community)
  const { data: unsharedData, isLoading: isLoadingUnshared, refetch: refetchUnshared } = useQuery({
    queryKey: ['/api/generations/unshared'],
    queryFn: async () => {
      const response = await fetch('/api/generations/unshared');
      if (!response.ok) throw new Error('Failed to fetch unshared generations');
      return response.json();
    },
    enabled: showCleanupDialog, // Only fetch when dialog is open
  });

  // Query to fetch user's favorites
  const { data: favoritesData } = useQuery({
    queryKey: ['/api/favorites'],
  });

  // Create a set of favorite generation IDs for quick lookup
  const favoriteIds = useMemo(() => {
    if (!favoritesData || !Array.isArray(favoritesData)) return new Set<string>();
    return new Set(favoritesData.map((fav: { generationId: string }) => fav.generationId));
  }, [favoritesData]);

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (generationIds: string[]) => {
      return await apiRequest('DELETE', '/api/generations/bulk', { generationIds });
    },
    onSuccess: (data, generationIds) => {
      toast({
        title: "Images Deleted Successfully",
        description: `Permanently deleted ${generationIds.length} private images from your gallery.`,
      });
      
      // Refresh all relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/generations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/generations/unshared'] });
      
      // Close dialog and reset selections
      setShowCleanupDialog(false);
      setSelectedForCleanup(new Set());
    },
    onError: (error: any) => {
      console.error('Bulk delete error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete images. Please try again.",
        variant: "destructive",
      });
    },
  });

  const loadMoreGenerations = async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const newOffset = allGenerations.length;
      const favoritesParam = filterFavorites === 'favorites' ? '&favoritesOnly=true' : '';
      const response = await fetch(`/api/generations?limit=80&offset=${newOffset}${favoritesParam}`);
      const data: PaginatedGenerationsResponse = await response.json();
      setAllGenerations(prev => [...prev, ...data.generations]);
      setOffset(newOffset);
    } catch (error) {
      console.error('Error loading more generations:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filteredGenerations = useMemo(() => {
    // Note: favorites filtering is now done server-side, so we only filter by search and status here
    return allGenerations
      .filter(gen => {
        const matchesSearch = gen.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
          gen.negativePrompt?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || gen.status === filterStatus;
        return matchesSearch && matchesStatus;
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
  }, [allGenerations, searchTerm, filterStatus, sortBy]);

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
                <h1 className="text-xl sm:text-2xl font-bold">Image Gallery</h1>
              </div>
            </div>
            
            {/* Second row - Search and controls */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              {/* Search - full width on mobile */}
              <div className="relative flex-1 sm:flex-initial">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search prompts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-80 bg-dark-bg border-dark-border text-white"
                  data-testid="input-search-generations"
                />
              </div>

              {/* Controls - stack on mobile, row on desktop */}
              <div className="flex flex-wrap gap-2 sm:gap-4 sm:items-center">
                {/* Upscaled Images Button */}
                <Link href="/enhanced-images">
                  <Button
                    variant="outline" 
                    size="sm"
                    className="text-purple-400 border-purple-400/50 hover:bg-purple-400/10 hover:border-purple-400 whitespace-nowrap"
                    data-testid="button-enhanced-images"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Upscaled Images</span>
                    <span className="sm:hidden">Upscaled</span>
                  </Button>
                </Link>

                {/* Cleanup Private Images Button */}
                <Button
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowCleanupDialog(true)}
                  className="text-white border-orange-500/50 hover:bg-orange-500/10 hover:border-orange-500 whitespace-nowrap"
                  data-testid="button-cleanup-private"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Clean up Private</span>
                  <span className="sm:hidden">Clean up</span>
                </Button>

                <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                  <SelectTrigger className="w-full sm:w-32 bg-dark-bg border-dark-border text-white">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-dark-card border-dark-border">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterFavorites} onValueChange={(value: any) => setFilterFavorites(value)}>
                  <SelectTrigger className="w-full sm:w-32 bg-dark-bg border-dark-border text-white" data-testid="select-favorites-filter">
                    <Heart className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Favorites" />
                  </SelectTrigger>
                  <SelectContent className="bg-dark-card border-dark-border">
                    <SelectItem value="all">All Images</SelectItem>
                    <SelectItem value="favorites">Favorites</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-full sm:w-32 bg-dark-bg border-dark-border text-white">
                    <SortDesc className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent className="bg-dark-card border-dark-border">
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="cost">Cost</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex rounded-md border border-dark-border bg-dark-bg">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGridSize('small')}
                    className={gridSize === 'small' ? 'bg-slate-700' : ''}
                    data-testid="button-grid-small"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGridSize('medium')}
                    className={gridSize === 'medium' ? 'bg-slate-700' : ''}
                    data-testid="button-grid-medium"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGridSize('large')}
                    className={gridSize === 'large' ? 'bg-slate-700' : ''}
                    data-testid="button-grid-large"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
            <div className="text-slate-400">Loading your gallery...</div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Generation Statistics</h2>
                  <div className="flex items-center space-x-6 text-sm text-slate-400">
                    <span>Loaded: {allGenerations.length} of {totalGenerations}</span>
                    <span>Completed: {allGenerations.filter(g => g.status === 'completed').length}</span>
                    <span>Processing: {allGenerations.filter(g => g.status === 'processing').length}</span>
                    <span>Failed: {allGenerations.filter(g => g.status === 'failed').length}</span>
                  </div>
                </div>
              </div>
              <p className="text-slate-400">
                Showing {filteredGenerations.length} of {allGenerations.length} loaded generations
                {allGenerations.length < totalGenerations && ` (${totalGenerations} total)`}
              </p>
            </div>

            {filteredGenerations.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-dark-bg rounded-full mx-auto mb-6 flex items-center justify-center">
                  <Calendar className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-xl font-medium mb-3 text-white">No generations found</h3>
                <p className="text-slate-400 mb-6 max-w-md mx-auto">
                  {searchTerm || filterStatus !== 'all' 
                    ? 'Try adjusting your search terms or filters.' 
                    : 'Generate some images to see them here!'
                  }
                </p>
                <Link href="/">
                  <Button size="lg" data-testid="button-start-generating">
                    Start Generating
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <ImageGallery 
                  generations={filteredGenerations}
                  showViewAll={true}
                  gridCols={gridSize}
                  showMetadata={true}
                  allowMultiSelect={true}
                />
                
                {/* Load More Button */}
                {hasMore && allGenerations.length > 0 && (
                  <div className="flex justify-center mt-8">
                    <Button 
                      onClick={loadMoreGenerations}
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
                        `Load More Images (${totalGenerations - allGenerations.length} remaining)`
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Cleanup Private Images Dialog */}
      <Dialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <DialogContent className="bg-dark-card border-dark-border text-white max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Clean up Private Images
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              These are images in your gallery that are NOT shared with the community. Select which ones you want to permanently delete.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isLoadingUnshared ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Finding private images...</span>
              </div>
            ) : unsharedData?.images?.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-slate-400 mb-4">
                  <Trash2 className="mx-auto h-12 w-12 mb-3 text-green-500" />
                  <p>No private images found!</p>
                  <p className="text-sm">All your completed images are shared with the community.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-400">
                    Found {unsharedData?.images?.length || 0} private images
                    {selectedForCleanup.size > 0 && (
                      <span className="ml-2 text-orange-400">
                        • {selectedForCleanup.size} selected for deletion
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedForCleanup.size === unsharedData?.images?.length) {
                          setSelectedForCleanup(new Set());
                        } else {
                          setSelectedForCleanup(new Set(unsharedData?.images?.map((img: Generation) => img.id) || []));
                        }
                      }}
                      className="text-xs"
                    >
                      {selectedForCleanup.size === unsharedData?.images?.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                  {unsharedData?.images?.map((generation: Generation) => (
                    <div key={generation.id} className="relative group">
                      <div 
                        className={`relative overflow-hidden rounded-lg border-2 cursor-pointer transition-all ${
                          selectedForCleanup.has(generation.id) 
                            ? 'border-red-500 shadow-lg shadow-red-500/25' 
                            : 'border-dark-border hover:border-slate-500'
                        }`}
                        onClick={() => {
                          const newSelected = new Set(selectedForCleanup);
                          if (newSelected.has(generation.id)) {
                            newSelected.delete(generation.id);
                          } else {
                            newSelected.add(generation.id);
                          }
                          setSelectedForCleanup(newSelected);
                        }}
                      >
                        <img
                          src={`/api/images/${generation.id}`}
                          alt={generation.prompt || 'Generated image'}
                          className="w-full aspect-square object-cover"
                        />
                        
                        {/* Checkbox overlay */}
                        <div className="absolute top-2 right-2">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedForCleanup.has(generation.id)
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'bg-black/50 border-white/50'
                          }`}>
                            {selectedForCleanup.has(generation.id) && (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>

                        {/* Selection overlay */}
                        {selectedForCleanup.has(generation.id) && (
                          <div className="absolute inset-0 bg-red-500/20 border border-red-500/50" />
                        )}
                      </div>
                      
                      {/* Image info */}
                      <div className="mt-2 text-xs text-slate-400 line-clamp-2">
                        {generation.prompt || 'No prompt'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowCleanupDialog(false)}
              disabled={bulkDeleteMutation.isPending}
            >
              Cancel
            </Button>
            
            {unsharedData?.images?.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={selectedForCleanup.size === 0 || bulkDeleteMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {bulkDeleteMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete {selectedForCleanup.size} Images
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                
                <AlertDialogContent className="bg-dark-card border-dark-border text-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-400">Confirm Permanent Deletion</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                      You are about to permanently delete {selectedForCleanup.size} private images from your gallery.
                      <br />
                      <strong className="text-red-400">This action cannot be undone!</strong>
                      <br />
                      These images will be completely removed from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-dark-bg border-dark-border text-white hover:bg-slate-700">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        // Only delete images that actually exist in current data
                        const currentImageIds = new Set(unsharedData?.images?.map((img: Generation) => img.id) || []);
                        const validIdsToDelete = Array.from(selectedForCleanup).filter(id => currentImageIds.has(id));
                        
                        console.log(`🧹 Cleanup: ${selectedForCleanup.size} selected, ${validIdsToDelete.length} valid to delete`);
                        
                        if (validIdsToDelete.length > 0) {
                          bulkDeleteMutation.mutate(validIdsToDelete);
                        } else {
                          toast({
                            title: "No images to delete",
                            description: "The selected images may have already been removed.",
                            variant: "destructive"
                          });
                          setShowCleanupDialog(false);
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Yes, Delete Permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}