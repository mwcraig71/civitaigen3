import { X, Download, Heart, Share2, Copy, ChevronLeft, ChevronRight, Maximize, Minimize, User, Info, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Generation, Model } from '@/types';
import type { Character, Favorite } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface ImageModalProps {
  generation: Generation;
  allGenerations?: Generation[];
  isOpen: boolean;
  onClose: () => void;
}

export default function ImageModal({ generation, allGenerations = [], isOpen, onClose }: ImageModalProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [showHints, setShowHints] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Find current generation index in the array
  const [isInGallery, setIsInGallery] = useState(false);
  
  useEffect(() => {
    if (allGenerations.length > 0) {
      const index = allGenerations.findIndex(gen => gen.id === generation.id);
      if (index >= 0) {
        setCurrentIndex(index);
        setIsInGallery(true);
      } else {
        // Image is not in the gallery (e.g., community image)
        setIsInGallery(false);
      }
    } else {
      setIsInGallery(false);
    }
  }, [generation.id, allGenerations]);

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-hide navigation hints after 2 seconds
  useEffect(() => {
    if (isOpen && isMobile) {
      setShowHints(true); // Show hints when modal opens
      const timer = setTimeout(() => {
        setShowHints(false);
      }, 2000); // Hide after 2 seconds
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMobile]);

  // Reset details view when modal opens/closes
  useEffect(() => {
    if (isOpen && isMobile) {
      setShowDetails(false);
    }
  }, [isOpen, isMobile]);

  // Only use gallery navigation if the image is actually in the gallery
  const currentGeneration = (isInGallery && allGenerations.length > 0) ? allGenerations[currentIndex] : generation;
  
  const { data: model, isLoading: modelLoading } = useQuery<Model>({
    queryKey: ['/api/models', currentGeneration.modelId],
    enabled: !!currentGeneration.modelId && isOpen,
  });

  // Get user's favorites
  const { data: favorites = [] } = useQuery<Favorite[]>({
    queryKey: ['/api/favorites'],
  });

  const { data: allModels = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
    enabled: isOpen,
  });

  // Fetch character data if characterId exists
  const { data: character } = useQuery<Character>({
    queryKey: ['/api/characters', currentGeneration.characterId],
    enabled: !!currentGeneration.characterId && isOpen,
  });

  // NOTE: All hooks must be called above this line - React requires hooks to be called unconditionally

  // Only allow navigation if the image is in the gallery array
  const canNavigate = isInGallery && allGenerations.length > 1;
  const isFirstImage = currentIndex === 0;
  const isLastImage = currentIndex === allGenerations.length - 1;

  const handlePrevious = () => {
    if (!isFirstImage && !isTransitioning) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(currentIndex - 1);
        setIsTransitioning(false);
      }, 150);
    }
  };

  const handleNext = () => {
    if (!isLastImage && !isTransitioning) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setIsTransitioning(false);
      }, 150);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        handlePrevious();
        break;
      case 'ArrowRight':
        e.preventDefault();
        handleNext();
        break;
      case 'Escape':
        e.preventDefault();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
        break;
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isFullscreen, currentIndex, allGenerations.length]);

  // Early return AFTER all hooks are called (React rules of hooks)
  const _videoUrl = (currentGeneration as any).videoUrl as string | undefined;
  if (!currentGeneration.imageUrl && !_videoUrl) return null;

  // Touch handlers for swipe gestures with smooth dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentTouch = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    };
    
    setTouchEnd(currentTouch);
    
    // Update drag offset for smooth dragging effect
    if (touchStart.x && !showDetails && canNavigate) {
      const deltaY = touchStart.y - currentTouch.y;
      const isVerticalSwipe = Math.abs(deltaY) > Math.abs(touchStart.x - currentTouch.x);
      
      if (isVerticalSwipe) {
        // Limit drag distance and add resistance
        const resistance = 0.4;
        const maxDrag = 100;
        const rawOffset = deltaY * resistance;
        setDragOffset(Math.max(-maxDrag, Math.min(maxDrag, rawOffset)));
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart.x || !touchEnd.x) {
      setDragOffset(0);
      return;
    }
    
    const horizontalDistance = touchStart.x - touchEnd.x;
    const verticalDistance = touchStart.y - touchEnd.y;
    
    const isLeftSwipe = horizontalDistance > 50;
    const isRightSwipe = horizontalDistance < -50;
    const isUpSwipe = verticalDistance > 50;
    const isDownSwipe = verticalDistance < -50;
    
    // Determine if the swipe is more horizontal or vertical
    const isHorizontalSwipe = Math.abs(horizontalDistance) > Math.abs(verticalDistance);
    const isVerticalSwipe = Math.abs(verticalDistance) > Math.abs(horizontalDistance);

    if (isMobile) {
      if (isHorizontalSwipe) {
        // Horizontal swipes for details panel
        if (isLeftSwipe && !showDetails) {
          setShowDetails(true);
        } else if (isRightSwipe && showDetails) {
          setShowDetails(false);
        }
      } else if (isVerticalSwipe && canNavigate) {
        // Vertical swipes for image navigation with momentum
        const swipeVelocity = Math.abs(verticalDistance);
        const swipeThreshold = swipeVelocity > 80 ? 30 : 50; // Lower threshold for faster swipes
        
        if (Math.abs(verticalDistance) > swipeThreshold) {
          if (isUpSwipe && !isLastImage) {
            handleNext();
          } else if (isDownSwipe && !isFirstImage) {
            handlePrevious();
          }
        }
      }
    }
    
    // Reset drag offset with smooth transition
    setDragOffset(0);
  };

  const handleDownload = () => {
    const vUrl = (currentGeneration as any).videoUrl as string | undefined;
    const link = document.createElement('a');
    link.href = vUrl || currentGeneration.imageUrl!;
    link.download = vUrl ? `generated-${currentGeneration.id}.mp4` : `generated-${currentGeneration.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(currentGeneration.prompt);
      toast({
        title: "Prompt Copied",
        description: "The prompt has been copied to your clipboard.",
      });
    } catch (error) {
      console.error('Failed to copy prompt:', error);
    }
  };

  const handleLike = async () => {
    const isFavorited = favorites.some(fav => fav.generationId === currentGeneration.id);
    
    try {
      if (isFavorited) {
        // Remove from favorites
        await apiRequest('DELETE', `/api/favorites/${currentGeneration.id}`, {});
        toast({
          title: "Removed from Favorites",
          description: "Image has been removed from your favorites.",
        });
      } else {
        // Add to user's favorites
        await apiRequest('POST', '/api/favorites', { generationId: currentGeneration.id });
        toast({
          title: "Added to Favorites",
          description: "Image has been added to your favorites.",
        });
      }
      
      // Invalidate favorites cache to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
    } catch (error) {
      console.error('Error updating favorites:', error);
      toast({
        title: "Error",
        description: isFavorited ? "Failed to remove from favorites" : "Failed to add to favorites",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    try {
      // Share image to community
      const sharedImageData = {
        generationId: currentGeneration.id,
        title: `Generated Image - ${new Date().toLocaleDateString()}`,
        prompt: currentGeneration.prompt,
        negativePrompt: currentGeneration.negativePrompt || '',
        imageUrl: currentGeneration.imageUrl,
        modelId: currentGeneration.modelId,
        isNSFW: false,
        tags: [],
        featured: false
      };
      
      await apiRequest('POST', '/api/shared-images', sharedImageData);
      
      toast({
        title: "Shared!",
        description: "Image has been shared to the community.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share image",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPrompt = () => {
    // Get model info or fallback to basic info
    const modelName = model?.name || (modelLoading ? 'Loading model info...' : 'Model not found');
    const modelArn = model?.arn || 'Not available';
    const modelType = model?.type || 'Unknown';
    const baseModel = model?.baseModel || 'Unknown';
    
    const promptData = `AI Image Generation Details
Generated on: ${new Date(currentGeneration.createdAt).toLocaleString()}

MODEL INFORMATION:
Name: ${modelName}
URN/ARN: ${modelArn}
Model ID: ${currentGeneration.modelId}
Type: ${modelType}
Base Model: ${baseModel}
${model?.description ? `Description: ${model.description.replace(/<[^>]*>/g, '').slice(0, 200)}...` : ''}

PROMPT:
${currentGeneration.prompt}

NEGATIVE PROMPT:
${currentGeneration.negativePrompt || 'None'}

GENERATION SETTINGS:
Steps: ${currentGeneration.steps}
CFG Scale: ${currentGeneration.cfgScale}
Scheduler: ${currentGeneration.scheduler}
Clip Skip: ${currentGeneration.clipSkip}
Seed: ${currentGeneration.seed !== undefined && currentGeneration.seed !== -1 ? currentGeneration.seed : 'Random'}
Dimensions: ${currentGeneration.width}x${currentGeneration.height}

LORAS & ADDITIONAL NETWORKS:
${model?.arn ? `Model ARN: ${model.arn}` : 'No additional networks detected'}
${model?.type === 'LORA' ? `LoRA Type: ${model.type}` : ''}
${currentGeneration.prompt.includes('<lora:') ? 'LoRA tags detected in prompt' : 'No LoRA tags in prompt'}

TECHNICAL DETAILS:
Generation ID: ${currentGeneration.id}
User ID: ${currentGeneration.userId}
Status: ${currentGeneration.status}
Blob Key: ${currentGeneration.blobKey || 'Not available'}

GENERATION COST:
${currentGeneration.cost || 5} Buzz Credits

IMAGE URL:
${currentGeneration.imageUrl || 'Not available'}
`;

    const blob = new Blob([promptData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt_${currentGeneration.id}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Prompt Downloaded",
      description: "Generation details saved to your downloads folder.",
    });
  };

  const handleReuse = () => {
    // IMPORTANT: Always use the original generation passed to the modal, not currentGeneration
    // currentGeneration can be wrong when the clicked image isn't in allGenerations array
    const targetGeneration = generation;
    
    // Save all generation data to localStorage with the same keys the generation panel uses
    // IMPORTANT: This REPLACES existing values, doesn't append
    const generationData = {
      modelId: targetGeneration.modelId || '',
      prompt: targetGeneration.prompt,
      negativePrompt: targetGeneration.negativePrompt || '', // This replaces, doesn't append
      seed: targetGeneration.seed,
      steps: targetGeneration.steps,
      cfgScale: targetGeneration.cfgScale,
      width: targetGeneration.width,
      height: targetGeneration.height,
      scheduler: targetGeneration.scheduler,
      clipSkip: targetGeneration.clipSkip,
      quantity: targetGeneration.quantity || 1,
      loras: targetGeneration.loras || [],
      characterId: targetGeneration.characterId || '',
    };

    // Save to localStorage with the same keys the generation panel expects
    // This completely replaces existing values
    Object.entries(generationData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        localStorage.setItem(`generationPanel_${key}`, JSON.stringify(value));
      }
    });

    // Trigger multiple storage events for better detection
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

    // Trigger a custom event for more reliable detection
    window.dispatchEvent(new CustomEvent('generationDataUpdated', {
      detail: { generationData, source: 'imageModal' }
    }));

    // If there's character data, also save it
    if (character) {
      localStorage.setItem('generationPanel_selectedCharacter', JSON.stringify(character));
    }

    // Close the modal
    onClose();

    // Navigate to the generator
    navigate('/generate');

    // Small delay to ensure navigation completes before showing toast
    setTimeout(() => {
      toast({
        title: "Settings Applied",
        description: "All generation settings have been loaded into the generator. Ready to create!",
        duration: 2000,
      });
    }, 100);
  };

  // Mobile view with swipe functionality
  if (isMobile) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent 
          className="max-w-[100vw] max-h-[100vh] w-full h-full overflow-hidden bg-black border-none p-0 m-0 [&>button]:hidden"
        >
          <DialogTitle className="sr-only">Mobile Image View</DialogTitle>
          <DialogDescription className="sr-only">
            View the generated image in mobile mode with swipe gestures to reveal details.
          </DialogDescription>
          
          <div 
            ref={containerRef}
            className="relative w-full h-full transition-transform duration-300 ease-out"
            style={{ 
              transform: showDetails ? 'translateX(-100vw)' : 'translateX(0)',
              width: '200vw',
              display: 'flex'
            }}
          >
            {/* Main Image Panel */}
            <div 
              className="relative bg-black transition-all duration-300 ease-out"
              style={{ 
                transform: `translateY(${dragOffset}px)`,
                opacity: isTransitioning ? 0.7 : 1,
                height: '100vh',
                width: '100vw',
                minWidth: '100vw',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {_videoUrl ? (
                <video
                  src={_videoUrl}
                  poster={(currentGeneration as any).videoThumbnailUrl || currentGeneration.imageUrl || undefined}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="rounded-lg"
                  style={{ maxWidth: '90vw', maxHeight: '80vh' }}
                  data-testid="modal-video"
                />
              ) : (
                <img
                  src={currentGeneration.imageUrl}
                  alt={`Generated image: ${currentGeneration.prompt.slice(0, 50)}...`}
                  className={`transition-all duration-500 ease-out ${
                    isTransitioning ? 'scale-95 blur-sm' : 'scale-100'
                  }`}
                  data-testid="mobile-image"
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '80vh',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    transform: `scale(${isTransitioning ? 0.95 : 1}) translateY(${dragOffset * 0.3}px)`,
                    transition: isTransitioning ? 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : dragOffset !== 0 ? 'none' : 'transform 0.3s ease-out',
                    touchAction: 'auto'
                  }}
                />
              )}
              
              {/* Top Controls */}
              <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="bg-black/50 hover:bg-black/70 text-white"
                  data-testid="button-close-mobile"
                >
                  <X className="h-6 w-6" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDetails(!showDetails)}
                  className="bg-black/50 hover:bg-black/70 text-white"
                  data-testid="button-toggle-details"
                >
                  <Info className="h-6 w-6" />
                </Button>
              </div>

              {/* Navigation removed for mobile - using swipe gestures instead */}
              
              {/* Bottom Swipe Hints - Enhanced (Auto-hide after 2 seconds) */}
              {!showDetails && !isTransitioning && dragOffset === 0 && showHints && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 space-y-2 text-center animate-fade-in">
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                    ← Swipe left for details
                  </div>
                  {canNavigate && (
                    <div className="bg-black/70 text-white px-4 py-2 rounded-full text-xs backdrop-blur-sm">
                      ↕ Swipe up/down for next/previous
                    </div>
                  )}
                </div>
              )}
              
              {/* Drag Feedback */}
              {dragOffset !== 0 && (
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                  {dragOffset > 20 ? '↑ Release to go next' : dragOffset < -20 ? '↓ Release to go back' : '↕ Keep swiping'}
                </div>
              )}
              
              {/* Image Counter */}
              {canNavigate && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm transition-all duration-300">
                  <span className={`transition-all duration-300 ${isTransitioning ? 'text-blue-400' : ''}`}>
                    {currentIndex + 1} / {allGenerations.length}
                  </span>
                </div>
              )}
            </div>

            {/* Details Panel */}
            <div 
              className="bg-dark-card flex flex-col overflow-hidden" 
              style={{ width: '100vw', minWidth: '100vw', height: '100vh', flexShrink: 0 }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-dark-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Image Details</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowDetails(false)}
                    className="text-slate-400"
                    data-testid="button-hide-details"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                {canNavigate && (
                  <p className="text-sm text-slate-400 mt-1">
                    {currentIndex + 1} of {allGenerations.length}
                  </p>
                )}
              </div>
              
              <ScrollArea className="flex-1 [&>div]:scroll-smooth">
                <div className="space-y-4 text-sm p-4 pb-32">
                  {/* Prompt */}
                  <div>
                    <label className="text-slate-400 text-xs uppercase tracking-wide">Prompt</label>
                    <div className="mt-2 p-5 bg-dark-bg rounded-lg border border-dark-border">
                      <p className="text-white leading-relaxed text-base whitespace-pre-wrap break-words" data-testid="mobile-prompt">
                        {currentGeneration.prompt}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyPrompt}
                        className="mt-2 text-xs text-primary-500 hover:text-primary-400 p-0"
                        data-testid="button-copy-prompt-mobile"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>

                  {/* Character */}
                  {currentGeneration.characterId && character && (
                    <div>
                      <label className="text-slate-400 text-xs uppercase tracking-wide">Character</label>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-4 w-4 text-blue-400" />
                        <p className="text-blue-300 font-medium" data-testid="mobile-character">
                          {character.name}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Model */}
                  <div>
                    <label className="text-slate-400 text-xs uppercase tracking-wide">Model</label>
                    <p className="mt-1 text-white font-medium" data-testid="mobile-model">
                      {model?.name || 'Unknown Model'}
                    </p>
                  </div>

                  {/* Key Parameters in Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 text-xs uppercase tracking-wide">Steps</label>
                      <p className="mt-1 text-white font-mono text-sm">{currentGeneration.steps}</p>
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs uppercase tracking-wide">CFG</label>
                      <p className="mt-1 text-white font-mono text-sm">{currentGeneration.cfgScale}</p>
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs uppercase tracking-wide">Size</label>
                      <p className="mt-1 text-white font-mono text-sm">
                        {currentGeneration.width}×{currentGeneration.height}
                      </p>
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs uppercase tracking-wide">Seed</label>
                      <p className="mt-1 text-white font-mono text-sm">
                        {currentGeneration.seed !== undefined && currentGeneration.seed !== -1 ? currentGeneration.seed : 'Random'}
                      </p>
                    </div>
                  </div>

                  {/* Image ID Section */}
                  <div>
                    <label className="text-slate-400 text-xs uppercase tracking-wide">Image ID (use as seed)</label>
                    <div className="mt-2 p-3 bg-dark-bg rounded-lg border border-dark-border">
                      <p className="text-green-400 font-mono text-sm break-all" data-testid="mobile-image-id">
                        {currentGeneration.id}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(currentGeneration.id);
                            toast({
                              title: "Image ID Copied",
                              description: "You can now paste this as a seed value.",
                            });
                          } catch (error) {
                            console.error('Failed to copy ID:', error);
                          }
                        }}
                        className="mt-2 text-xs text-green-500 hover:text-green-400 p-0"
                        data-testid="button-copy-id-mobile"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy as Seed
                      </Button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3 pt-4 border-t border-dark-border">
                    <Button
                      onClick={handleReuse}
                      className="w-full bg-green-600 hover:bg-green-700"
                      data-testid="button-reuse-mobile"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reuse in Generator
                    </Button>
                    <Button
                      onClick={handleDownload}
                      className="w-full bg-primary-500 hover:bg-primary-600"
                      data-testid="button-download-mobile"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Image
                    </Button>
                    <div className="flex space-x-2">
                      <Button
                        onClick={handleLike}
                        variant="outline"
                        size="icon"
                        className="flex-1 border-dark-border hover:bg-dark-bg"
                        data-testid="button-favorite-mobile"
                      >
                        <Heart className={`h-4 w-4 ${favorites.some(fav => fav.generationId === currentGeneration.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                      </Button>
                      <Button
                        onClick={handleShare}
                        variant="outline"
                        size="icon"
                        className="flex-1 border-dark-border hover:bg-dark-bg"
                        data-testid="button-share-mobile"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
              
              {/* Swipe hint for going back */}
              <div className="p-4 border-t border-dark-border">
                <div className="text-center text-slate-400 text-xs">
                  → Swipe right to return to image
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  // Desktop fullscreen view
  if (isFullscreen) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent 
          className="max-w-none max-h-none w-screen h-screen overflow-hidden bg-black border-none p-0 m-0 data-[state=open]:animate-none [&>button.absolute.right-4.top-4]:hidden"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, transform: 'none' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Fullscreen Image View</DialogTitle>
          <DialogDescription className="sr-only">
            View the generated image in fullscreen mode with navigation controls.
          </DialogDescription>
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Fullscreen Image */}
            <img
              src={currentGeneration.imageUrl}
              alt={`Generated image: ${currentGeneration.prompt.slice(0, 50)}...`}
              className={`w-screen h-screen object-contain transition-all duration-500 ease-out ${
                isTransitioning ? 'scale-95 opacity-70' : 'scale-100 opacity-100'
              }`}
              data-testid="fullscreen-image"
              style={{
                touchAction: 'auto'
              }}
            />
            
            {/* Navigation Controls */}
            {canNavigate && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevious}
                  disabled={isFirstImage}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white disabled:opacity-30"
                  data-testid="button-previous-fullscreen"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNext}
                  disabled={isLastImage}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white disabled:opacity-30"
                  data-testid="button-next-fullscreen"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}
            
            {/* Single Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white"
              data-testid="button-close-fullscreen"
            >
              <X className="h-6 w-6" />
            </Button>
            
            {/* Image Counter */}
            {canNavigate && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded">
                {currentIndex + 1} / {allGenerations.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden bg-dark-card border-dark-border p-0 [&>button.absolute.right-4.top-4]:hidden">
        <div className="flex h-full">
          {/* Image Display */}
          <div className="relative flex-1 flex items-center justify-center bg-dark-bg">
            <img
              src={currentGeneration.imageUrl}
              alt={`Generated image: ${currentGeneration.prompt.slice(0, 50)}...`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              data-testid="modal-image"
              style={{
                touchAction: 'auto'
              }}
            />
            
            {/* Navigation Controls for Modal View */}
            {canNavigate && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevious}
                  disabled={isFirstImage}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white disabled:opacity-30"
                  data-testid="button-previous-modal"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNext}
                  disabled={isLastImage}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white disabled:opacity-30"
                  data-testid="button-next-modal"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
            
            {/* Fullscreen Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(true)}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white"
              data-testid="button-fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>

          {/* Image Details */}
          <div className="w-96 border-l border-dark-border flex flex-col max-h-[95vh]">
            <div className="p-6 pb-4 shrink-0">
              <DialogHeader className="flex flex-row items-center justify-between mb-4 space-y-0">
                <div>
                  <DialogTitle className="font-semibold text-lg" data-testid="modal-title">Image Details</DialogTitle>
                  <DialogDescription className="sr-only">
                    View detailed information about the generated image including prompt, model settings, and parameters.
                  </DialogDescription>
                  {canNavigate && (
                    <p className="text-sm text-slate-400 mt-1">
                      {currentIndex + 1} of {allGenerations.length}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="hover:bg-dark-bg"
                  data-testid="button-close-modal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
            </div>
            
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 text-sm pb-6">
              {/* Prompt */}
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide">Prompt</label>
                <div className="mt-2 p-5 bg-dark-bg rounded-lg border border-dark-border">
                  <p className="text-white leading-relaxed text-lg whitespace-pre-wrap break-words" data-testid="modal-prompt">
                    {currentGeneration.prompt}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPrompt}
                    className="mt-2 text-xs text-primary-500 hover:text-primary-400 p-0"
                    data-testid="button-copy-prompt"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>

              {/* Negative Prompt */}
              {currentGeneration.negativePrompt && (
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Negative Prompt</label>
                  <div className="mt-2 p-5 bg-dark-bg rounded-lg border border-dark-border">
                    <p className="text-white leading-relaxed text-lg whitespace-pre-wrap break-words" data-testid="modal-negative-prompt">
                      {currentGeneration.negativePrompt}
                    </p>
                  </div>
                </div>
              )}

              {/* Character */}
              {currentGeneration.characterId && character && (
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Character</label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-4 w-4 text-blue-400" />
                    <p className="text-blue-300 font-medium" data-testid="modal-character">
                      {character.name}
                    </p>
                  </div>
                  {character.description && (
                    <p className="text-slate-400 text-xs mt-1">
                      {character.description}
                    </p>
                  )}
                </div>
              )}

              {/* Model */}
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide">Model</label>
                <p className="mt-1 text-white font-medium" data-testid="modal-model">
                  {model?.name || 'Unknown Model'}
                </p>
                {model?.baseModel && (
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {model.baseModel}
                  </Badge>
                )}
              </div>

              {/* Parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Steps</label>
                  <p className="mt-1 text-white font-mono" data-testid="modal-steps">{currentGeneration.steps}</p>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">CFG Scale</label>
                  <p className="mt-1 text-white font-mono" data-testid="modal-cfg">{currentGeneration.cfgScale}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Size</label>
                  <p className="mt-1 text-white font-mono" data-testid="modal-size">
                    {currentGeneration.width}×{currentGeneration.height}
                  </p>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Seed</label>
                  <p className="mt-1 text-white font-mono" data-testid="modal-seed">
                    {currentGeneration.seed !== undefined && currentGeneration.seed !== -1 ? currentGeneration.seed : '-1'}
                  </p>
                </div>
              </div>

              {/* Image ID Section */}
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide">Image ID (use as seed)</label>
                <div className="mt-2 p-3 bg-dark-bg rounded-lg border border-dark-border">
                  <p className="text-green-400 font-mono break-all" data-testid="modal-image-id">
                    {currentGeneration.id}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(currentGeneration.id);
                        toast({
                          title: "Image ID Copied",
                          description: "You can now paste this as a seed value.",
                        });
                      } catch (error) {
                        console.error('Failed to copy ID:', error);
                      }
                    }}
                    className="mt-2 text-xs text-green-500 hover:text-green-400 p-0"
                    data-testid="button-copy-id-modal"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy as Seed
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Scheduler</label>
                  <p className="mt-1 text-white" data-testid="modal-scheduler">{currentGeneration.scheduler}</p>
                </div>
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">Clip Skip</label>
                  <p className="mt-1 text-white font-mono" data-testid="modal-clip-skip">{currentGeneration.clipSkip}</p>
                </div>
              </div>

              {/* LoRAs */}
              {currentGeneration.loras && currentGeneration.loras.length > 0 && (
                <div>
                  <label className="text-slate-400 text-xs uppercase tracking-wide">LoRAs Used</label>
                  <div className="mt-2 space-y-2">
                    {currentGeneration.loras.map((lora: {id: string; strength: number}, index: number) => {
                      const loraModel = allModels?.find(model => model.id === lora.id);
                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-dark-bg rounded border border-dark-border">
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium" data-testid={`modal-lora-${index}`}>
                              {loraModel?.name || 'Unknown LoRA'}
                            </div>
                            <div className="text-slate-500 text-xs font-mono mt-0.5">
                              ID: {lora.id}
                            </div>
                          </div>
                          <div className="ml-3 flex-shrink-0 text-right min-w-[80px]">
                            <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Strength</div>
                            <div className="text-lg font-bold text-primary-400 bg-primary-900/20 px-2 py-1 rounded">
                              {lora.strength > 0 ? '+' : ''}{lora.strength.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Created Date */}
              <div>
                <label className="text-slate-400 text-xs uppercase tracking-wide">Created</label>
                <p className="mt-1 text-white" data-testid="modal-created">
                  {new Date(currentGeneration.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-dark-border">
                <Button
                  onClick={handleReuse}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-reuse-modal"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reuse in Generator
                </Button>
                <Button
                  onClick={handleDownload}
                  className="w-full bg-primary-500 hover:bg-primary-600"
                  data-testid="button-download-modal"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Image
                </Button>
                <Button
                  onClick={handleDownloadPrompt}
                  variant="outline"
                  className="w-full border-dark-border hover:bg-dark-bg"
                  data-testid="button-download-prompt"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Prompt & Settings
                </Button>
                <div className="flex space-x-2">
                  <Button
                    onClick={handleLike}
                    variant="outline"
                    size="icon"
                    className="flex-1 border-dark-border hover:bg-dark-bg"
                    data-testid="button-favorite-modal"
                  >
                    <Heart className={`h-4 w-4 ${favorites.some(fav => fav.generationId === currentGeneration.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                  </Button>
                  <Button
                    onClick={handleShare}
                    variant="outline"
                    size="icon"
                    className="flex-1 border-dark-border hover:bg-dark-bg"
                    data-testid="button-share-modal"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
