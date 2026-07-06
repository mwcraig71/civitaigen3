import { useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Sparkles, Download, Loader2, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface EnhancedImage {
  id: string;
  userId: string;
  originalGenerationId: string;
  enhancedImageUrl: string | null;
  storedEnhancedPath: string | null;
  scaleFactor: number;
  enhancementModel?: string;
  faceEnhancement: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  processingTime: number | null;
  createdAt: string;
}

interface Generation {
  id: string;
  imageUrl: string;
  prompt: string;
}

interface PaginatedResponse {
  enhancements: EnhancedImage[];
  total: number;
  hasMore: boolean;
}

export default function EnhancedImages() {
  const [selectedEnhancement, setSelectedEnhancement] = useState<EnhancedImage | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 4>(1);
  const { toast } = useToast();

  const limit = 20; // Load 20 images per page

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ['/api/enhance/user/all'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/enhance/user/all?limit=${limit}&offset=${pageParam}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch enhancements');
      return response.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length * limit : undefined;
    },
    // Only poll if there are pending/processing items, otherwise no background polling
    refetchInterval: (query) => {
      const enhancements = query.state.data?.pages.flatMap(page => page.enhancements) ?? [];
      const hasPending = enhancements.some(e => e.status === 'pending' || e.status === 'processing');
      return hasPending ? 5000 : false; // Poll only when there are active jobs
    },
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
  });

  // Flatten all pages into a single array
  const enhancements = data?.pages.flatMap(page => page.enhancements) ?? [];

  const { data: originalGeneration } = useQuery<Generation>({
    queryKey: ['/api/generations', selectedEnhancement?.originalGenerationId],
    enabled: !!selectedEnhancement,
    queryFn: async () => {
      const response = await fetch(`/api/generations/${selectedEnhancement?.originalGenerationId}`);
      if (!response.ok) throw new Error('Failed to fetch original generation');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (enhancementId: string) => {
      return await apiRequest('DELETE', `/api/enhance/${enhancementId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enhance/user/all'] });
      setSelectedEnhancement(null);
      toast({ title: "Upscaled image deleted!" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete image",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleDownload = async (enhancedUrl: string, enhancementId: string) => {
    try {
      const response = await fetch(enhancedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `upscaled-${enhancementId}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Upscaled image downloaded!" });
    } catch (error) {
      toast({ title: "Failed to download image", variant: "destructive" });
    }
  };

  const handleDelete = (enhancementId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm('Are you sure you want to delete this upscaled image? This cannot be undone.')) {
      deleteMutation.mutate(enhancementId);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500 text-white"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-500 text-white"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge className="bg-gray-500 text-white">Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      {/* Header */}
      <div className="border-b border-dark-border bg-dark-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/generations">
                <Button variant="ghost" size="sm" className="text-white">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-400" />
                  Upscaled Images
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  View and download your AI-upscaled images
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : enhancements.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Upscaled Images Yet</h2>
            <p className="text-slate-400 mb-6">
              Go to your gallery and select images to upscale with AI
            </p>
            <Link href="/generations">
              <Button className="bg-purple-600 hover:bg-purple-700">
                Go to Gallery
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enhancements.map((enhancement) => (
              <Card key={enhancement.id} className="bg-dark-card border-dark-border overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative aspect-square bg-dark-bg">
                    {enhancement.status === 'completed' && enhancement.storedEnhancedPath ? (
                      <img
                        src={`/api/enhanced-images/${enhancement.id}`}
                        alt="Upscaled"
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setSelectedEnhancement(enhancement)}
                        data-testid={`enhanced-image-${enhancement.id}`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {enhancement.status === 'processing' && (
                          <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-purple-400 mx-auto mb-3" />
                            <p className="text-sm text-slate-400">Upscaling...</p>
                          </div>
                        )}
                        {enhancement.status === 'failed' && (
                          <div className="text-center px-4">
                            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                            <p className="text-sm text-red-400">Upscaling Failed</p>
                            {enhancement.errorMessage && (
                              <p className="text-xs text-slate-500 mt-2">{enhancement.errorMessage}</p>
                            )}
                          </div>
                        )}
                        {enhancement.status === 'pending' && (
                          <div className="text-center">
                            <Sparkles className="h-12 w-12 text-purple-400 mx-auto mb-3" />
                            <p className="text-sm text-slate-400">Queued</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      {getStatusBadge(enhancement.status)}
                      <div className="text-xs text-slate-400">
                        {enhancement.scaleFactor}x upscale
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {enhancement.enhancementModel === 'gfpgan' ? 'GFPGAN' : 'Real-ESRGAN'}
                      </Badge>
                      {enhancement.faceEnhancement && enhancement.enhancementModel !== 'gfpgan' && (
                        <Badge variant="outline" className="text-xs">
                          Face Upscaling
                        </Badge>
                      )}
                    </div>

                    {enhancement.processingTime && (
                      <div className="text-xs text-slate-500">
                        Processed in {(enhancement.processingTime / 1000).toFixed(1)}s
                      </div>
                    )}

                    <div className="flex gap-2">
                      {enhancement.status === 'completed' && enhancement.storedEnhancedPath && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedEnhancement(enhancement)}
                            className="flex-1 text-white border-purple-400/30 hover:bg-purple-400/10"
                            data-testid={`button-view-comparison-${enhancement.id}`}
                          >
                            View Comparison
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDownload(`/api/enhanced-images/${enhancement.id}`, enhancement.id)}
                            className="bg-purple-600 hover:bg-purple-700"
                            data-testid={`button-download-enhanced-${enhancement.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleDelete(enhancement.id, e)}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                        data-testid={`button-delete-enhanced-${enhancement.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {!isLoading && enhancements.length > 0 && hasNextPage && (
          <div className="flex justify-center mt-8">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="outline"
              size="lg"
              className="bg-purple-600/10 border-purple-400/30 hover:bg-purple-600/20 text-white"
              data-testid="button-load-more"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load More Images</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Before/After Comparison Modal - Fullscreen */}
      <Dialog open={!!selectedEnhancement} onOpenChange={() => setSelectedEnhancement(null)}>
        <DialogContent className="max-w-full h-screen w-screen bg-dark-card border-0 p-0 m-0 rounded-none">
          {selectedEnhancement && originalGeneration && (
            <div className="flex h-full w-full select-none">
              {/* Image Comparison Area - Left Side */}
              <div 
                className="flex-1 relative bg-dark-bg overflow-auto"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  msUserSelect: 'none',
                }}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center p-4"
                  style={{
                    userSelect: 'none',
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      width: '100%',
                      height: '100%',
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.2s ease-out',
                    }}
                  >
                    {/* Before Image (Original) */}
                    <img
                      src={originalGeneration.imageUrl}
                      alt="Original"
                      className="absolute inset-0 w-full h-full object-contain select-none"
                      draggable={false}
                      style={{ userSelect: 'none' }}
                    />

                    {/* After Image (Upscaled) with clip-path */}
                    {selectedEnhancement.storedEnhancedPath && (
                      <div
                        className="absolute inset-0 select-none"
                        style={{
                          clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
                          userSelect: 'none',
                        }}
                      >
                        <img
                          src={`/api/enhanced-images/${selectedEnhancement.id}`}
                          alt="Upscaled"
                          className="absolute inset-0 w-full h-full object-contain select-none"
                          draggable={false}
                          style={{ userSelect: 'none' }}
                        />
                      </div>
                    )}

                    {/* Slider Handle */}
                    <div
                      className="absolute inset-y-0 w-1 bg-white cursor-ew-resize z-10 select-none"
                      style={{ 
                        left: `${sliderPosition}%`,
                        userSelect: 'none',
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const parentElement = e.currentTarget.parentElement;
                        if (!parentElement) return;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          moveEvent.preventDefault();
                          const rect = parentElement.getBoundingClientRect();
                          const x = moveEvent.clientX - rect.left;
                          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                          setSliderPosition(percentage);
                        };

                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        const parentElement = e.currentTarget.parentElement;
                        if (!parentElement) return;

                        const handleTouchMove = (moveEvent: TouchEvent) => {
                          moveEvent.preventDefault();
                          const rect = parentElement.getBoundingClientRect();
                          const touch = moveEvent.touches[0];
                          const x = touch.clientX - rect.left;
                          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                          setSliderPosition(percentage);
                        };

                        const handleTouchEnd = () => {
                          document.removeEventListener('touchmove', handleTouchMove);
                          document.removeEventListener('touchend', handleTouchEnd);
                        };

                        document.addEventListener('touchmove', handleTouchMove);
                        document.addEventListener('touchend', handleTouchEnd);
                      }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-3 shadow-lg touch-none select-none">
                        <div className="w-6 h-6 flex items-center justify-center">
                          <div className="w-1 h-6 bg-purple-600"></div>
                        </div>
                      </div>
                    </div>

                    {/* Labels */}
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-black/70 text-white">Original</Badge>
                    </div>
                    <div className="absolute top-4 right-4">
                      <Badge className="bg-purple-600 text-white">Upscaled ({selectedEnhancement.scaleFactor}x)</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Control Panel - Right Side */}
              <div className="w-80 bg-dark-card border-l border-dark-border flex flex-col h-full">
                {/* Header */}
                <div className="p-4 border-b border-dark-border">
                  <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-400" />
                      Before / After
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Compare the original and upscaled images side by side
                    </DialogDescription>
                  </DialogHeader>
                </div>

                {/* Controls Container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Zoom Controls */}
                  <div className="space-y-2">
                    <span className="text-sm text-slate-400 font-medium">Zoom Level</span>
                    <div className="flex gap-1 bg-dark-bg rounded-lg p-1">
                      <Button
                        size="sm"
                        variant={zoomLevel === 1 ? "default" : "ghost"}
                        onClick={() => setZoomLevel(1)}
                        className={`flex-1 ${zoomLevel === 1 ? "bg-purple-600 hover:bg-purple-700" : "text-slate-400 hover:text-white"}`}
                        data-testid="button-zoom-1x"
                      >
                        1x
                      </Button>
                      <Button
                        size="sm"
                        variant={zoomLevel === 2 ? "default" : "ghost"}
                        onClick={() => setZoomLevel(2)}
                        className={`flex-1 ${zoomLevel === 2 ? "bg-purple-600 hover:bg-purple-700" : "text-slate-400 hover:text-white"}`}
                        data-testid="button-zoom-2x"
                      >
                        2x
                      </Button>
                      <Button
                        size="sm"
                        variant={zoomLevel === 4 ? "default" : "ghost"}
                        onClick={() => setZoomLevel(4)}
                        className={`flex-1 ${zoomLevel === 4 ? "bg-purple-600 hover:bg-purple-700" : "text-slate-400 hover:text-white"}`}
                        data-testid="button-zoom-4x"
                      >
                        4x
                      </Button>
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div className="space-y-2">
                    <span className="text-sm text-slate-400 font-medium">Comparison Slider</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Original</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderPosition}
                        onChange={(e) => setSliderPosition(Number(e.target.value))}
                        className="flex-1 h-2 bg-dark-bg rounded-lg appearance-none cursor-pointer slider"
                        data-testid="slider-comparison"
                      />
                      <span className="text-xs text-slate-500">Upscaled</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-2">
                    <span className="text-sm text-slate-400 font-medium">Details</span>
                    <div className="space-y-2">
                      <div className="bg-dark-bg rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Upscaling Model</div>
                        <div className="text-sm text-white font-medium">
                          {selectedEnhancement.enhancementModel === 'gfpgan' ? 'GFPGAN' : 'Real-ESRGAN'}
                        </div>
                      </div>
                      <div className="bg-dark-bg rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Upscale Factor</div>
                        <div className="text-sm text-white font-medium">{selectedEnhancement.scaleFactor}x</div>
                      </div>
                      {selectedEnhancement.enhancementModel !== 'gfpgan' && (
                        <div className="bg-dark-bg rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Face Upscaling</div>
                          <div className="text-sm text-white font-medium">{selectedEnhancement.faceEnhancement ? 'Yes' : 'No'}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    <Button
                      onClick={() => handleDownload(`/api/enhanced-images/${selectedEnhancement.id}`, selectedEnhancement.id)}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      data-testid="button-download-enhanced-modal"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      onClick={() => handleDelete(selectedEnhancement.id)}
                      disabled={deleteMutation.isPending}
                      variant="outline"
                      className="w-full text-red-400 border-red-400/30 hover:bg-red-400/10"
                      data-testid="button-delete-enhanced-modal"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
