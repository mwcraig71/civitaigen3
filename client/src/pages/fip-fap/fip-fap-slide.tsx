import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, X, Download, EyeOff, Eye, Sparkles, Trash2, AlertTriangle, User, Edit3, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SharedImage } from '@/types';

export interface FipFapSlideProps {
  image: SharedImage;
  isActive: boolean;
  shouldLoadEagerly?: boolean;
  onLoad: () => void;
  likedImages: Set<string>;
  onLike: (imageId: string) => void;
  onDownload: (image: SharedImage) => void;
  onDelete: (image: SharedImage) => void;
  onEditCharacter: (imageId: string, characterName: string, sceneName: string, rating: string) => void;
  showUI: boolean;
  onToggleUI: () => void;
  onGenerateRequested: (image: SharedImage) => void;
  isNewlyInserted?: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
  availableCharacters: { id: string; name: string; description?: string | null }[];
  galleryMode: string;
}

export function FipFapSlide({ image, isActive, shouldLoadEagerly = false, onLoad, likedImages, onLike, onDownload, onDelete, onEditCharacter, showUI, onToggleUI, onGenerateRequested, isNewlyInserted = false, currentUserId, isAdmin = false, availableCharacters, galleryMode }: FipFapSlideProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [isViewingPrompt, setIsViewingPrompt] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(image.characterName || 'none');
  const [selectedScene, setSelectedScene] = useState(image.sceneName || '');
  const [customScene, setCustomScene] = useState('');
  const [selectedRating, setSelectedRating] = useState(image.rating || 'R');
  const [isCustomScene, setIsCustomScene] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Upscale modal state
  const [showUpscaleModal, setShowUpscaleModal] = useState(false);
  const [upscaleModel, setUpscaleModel] = useState<'realesrgan' | 'gfpgan'>('realesrgan');
  const [upscaleScale, setUpscaleScale] = useState<2 | 4>(2);
  const [faceEnhancement, setFaceEnhancement] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch available scene names
  const { data: availableScenes = [] } = useQuery<string[]>({
    queryKey: ['/api/shared-images/scenes'],
  });

  // Upscale mutation
  const upscaleMutation = useMutation({
    mutationFn: async ({ generationId, scaleFactor, enhancementModel, faceEnhancement }: { 
      generationId: string, 
      scaleFactor: 2 | 4, 
      enhancementModel: 'realesrgan' | 'gfpgan',
      faceEnhancement: boolean 
    }) => {
      return await apiRequest('POST', '/api/enhance/submit', {
        generationIds: [generationId],
        scaleFactor,
        enhancementModel,
        faceEnhancement
      });
    },
    onSuccess: (data: any) => {
      setShowUpscaleModal(false);
      toast({
        title: "Upscaling Started!",
        description: data.message || "Your image is being upscaled. This may take a few minutes.",
      });
      // Refresh upscaled images list
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

  const handleUpscaleClick = () => {
    if (!image.generationId) {
      toast({
        title: "Cannot Upscale",
        description: "This image does not have generation data and cannot be upscaled.",
        variant: "destructive",
      });
      return;
    }
    setShowUpscaleModal(true);
  };

  const submitUpscale = () => {
    if (!image.generationId) return;
    
    upscaleMutation.mutate({
      generationId: image.generationId,
      scaleFactor: upscaleScale,
      enhancementModel: upscaleModel,
      faceEnhancement: upscaleModel === 'realesrgan' ? faceEnhancement : false,
    });
  };

  // Sync selectedCharacter state when image.characterName changes
  useEffect(() => {
    setSelectedCharacter(image.characterName || 'none');
  }, [image.characterName]);

  // Sync selectedScene state when image.sceneName changes
  useEffect(() => {
    const sceneName = image.sceneName || '';
    setSelectedScene(sceneName);
    // Check if current scene is in the list or if it's custom
    if (sceneName && !availableScenes.includes(sceneName)) {
      setIsCustomScene(true);
      setCustomScene(sceneName);
    } else {
      setIsCustomScene(false);
      setCustomScene('');
    }
  }, [image.sceneName, availableScenes]);
  
  // Double tap detection state for UI toggle
  const [lastTapTime, setLastTapTime] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  
  // Swipe detection state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const [ignoreTouchGestures, setIgnoreTouchGestures] = useState(false);
  const [lastSwipeTime, setLastSwipeTime] = useState(0);

  // Detect if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                           window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const getImageUrl = (image: SharedImage) => {
    // Handle all gallery modes with watermarking endpoints
    if (galleryMode === 'gallery') {
      // User's own gallery - image.id IS the generation ID
      return `/api/images/${image.id}`;
    } else if (galleryMode === 'favorites') {
      // Favorites - use generationId which links to original generation
      if (image.generationId) {
        return `/api/images/${image.generationId}`;
      }
      // Fallback for favorites without generationId
      return `/api/images/${image.id}`;
    } else {
      // Community gallery - use shared images watermarking endpoint
      return `/api/shared-images/${image.id}/image`;
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    onLoad();
  };

  // Combined touch handlers for mobile (double tap + swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    
    // Check if touch started on an interactive element
    const target = e.target as HTMLElement;
    const interactiveElement = target.closest('button, a, input, select, [role="button"], [data-interactive], [data-testid^="button-"], [data-testid^="select-"]');
    
    if (interactiveElement) {
      setIgnoreTouchGestures(true);
      return;
    }
    
    setIgnoreTouchGestures(false);
    const touch = e.touches[0];
    const startData = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    
    setTouchStart(startData);
    setIsSwipeActive(false);
    
    // Handle double tap detection for UI toggle
    const currentTime = Date.now();
    const timeBetweenTaps = currentTime - lastTapTime;
    
    // Reset tap count if too much time has passed (300ms double tap window)
    if (timeBetweenTaps > 300) {
      setTapCount(1);
    } else {
      setTapCount(prev => prev + 1);
    }
    
    setLastTapTime(currentTime);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || !touchStart || ignoreTouchGestures) {
      return;
    }
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    const deltaTime = Date.now() - touchStart.time;
    const currentTime = Date.now();
    
    // Check for double tap on quick, small movements (tap-like gesture)
    const tapThreshold = 10; // Small movement threshold for tap detection
    if (deltaX < tapThreshold && deltaY < tapThreshold && deltaTime < 200) {
      // This was a tap, check if it's the second tap
      if (tapCount >= 2) {
        // Double tap detected - toggle UI
        onToggleUI();
        setTapCount(0); // Reset tap count
        
        // Add haptic feedback for double tap
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    } else {
      // Reset tap count for non-tap gestures
      setTapCount(0);
    }
    
    // More sensitive swipe thresholds for easier triggering
    const screenWidth = window.innerWidth;
    const swipeThreshold = Math.max(30, screenWidth * 0.04); // Min 30px or 4% of screen width (more sensitive)
    const verticalDriftThreshold = Math.max(50, screenWidth * 0.08); // Min 50px or 8% of screen width (more forgiving)
    
    // Check for left swipe with cooldown protection
    const cooldownPeriod = 600; // 600ms cooldown (reduced from 800ms)
    const timeSinceLastSwipe = currentTime - lastSwipeTime;
    
    if (deltaX < -swipeThreshold && 
        deltaY < verticalDriftThreshold && 
        deltaTime < 800 && 
        timeSinceLastSwipe > cooldownPeriod) {
      
      // Left swipe - Enhanced generation
      setIsSwipeActive(true);
      setLastSwipeTime(currentTime);
      onGenerateRequested(image);
      
      // Reset tap count on swipe
      setTapCount(0);
      
      // Add haptic feedback for swipe
      if (navigator.vibrate) {
        navigator.vibrate([30, 100, 30]);
      }
    } else if (deltaX > swipeThreshold && 
               deltaY < verticalDriftThreshold && 
               deltaTime < 800 && 
               timeSinceLastSwipe > cooldownPeriod) {
      
      // Right swipe - Favorite/like
      setIsSwipeActive(true);
      setLastSwipeTime(currentTime);
      onLike(image.id);
      
      // Reset tap count on swipe
      setTapCount(0);
      
      // Add haptic feedback for favorite (different pattern)
      if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
      }
    }
    
    // Clean up
    setTimeout(() => {
      setIsSwipeActive(false);
      setTouchStart(null);
      setIgnoreTouchGestures(false);
    }, 100);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart || !isMobile || ignoreTouchGestures) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStart.x);
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    
    // Reset tap count if significant movement detected (no longer a tap)
    if (deltaX > 10 || deltaY > 10) {
      setTapCount(0);
    }
  };

  const handleTouchCancel = () => {
    // Clean up on gesture interruption (e.g., OS gesture, modal, etc.)
    setTapCount(0);
    setIsSwipeActive(false);
    setTouchStart(null);
    setIgnoreTouchGestures(false);
  };

  return (
    <section 
      className="relative w-full h-screen flex-shrink-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
    >
      {/* Background Image */}
      <div className="absolute inset-0 bg-black">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-900 animate-pulse" />
        )}
        <img
          src={getImageUrl(image)}
          alt={image.prompt || 'Generated image'}
          className={`w-full h-full object-contain object-center transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleImageLoad}
          loading={isActive || shouldLoadEagerly ? 'eager' : 'lazy'}
          data-testid={`fip-fap-image-${image.id}`}
        />
      </div>

      {/* Clean View Toggle Button - Desktop Only - Moved to avoid navigation overlap */}
      {!isMobile && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleUI();
          }}
          className="absolute top-20 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          data-testid="button-toggle-clean-view"
        >
          {showUI ? (
            <EyeOff className="h-4 w-4 text-white" />
          ) : (
            <Eye className="h-4 w-4 text-white" />
          )}
        </button>
      )}

      
      {/* Left Swipe Indicator for Mobile */}
      {isMobile && isSwipeActive && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="bg-purple-600/90 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m9-9l-9-9-9 9" />
            </svg>
            Opening modifiers...
          </div>
        </div>
      )}

      {/* Overlay Content */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${
        showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Top Info - Positioned to avoid navigation overlap */}
        <div className="absolute top-16 left-4 right-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2 flex-wrap">
            {isNewlyInserted && (
              <Badge variant="default" className="bg-green-500 text-white border-green-400 animate-pulse" data-testid="badge-new">
                ✨ New
              </Badge>
            )}
            <div className="flex items-center gap-1">
              {image.characterName ? (
                <Badge variant="secondary" className="bg-black/50 text-white border-white/20">
                  {image.characterName}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-black/30 text-white/70 border-white/10">
                  Community Image
                </Badge>
              )}
              {/* Show edit button if user owns this image or is admin */}
              {currentUserId && (image.userId === currentUserId || isAdmin) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingCharacter(true);
                  }}
                  className="p-1 bg-black/50 hover:bg-black/70 rounded text-white/70 hover:text-white transition-colors"
                  data-testid={`button-edit-character-${image.id}`}
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              )}
            </div>
            {image.sceneName && (
              <Badge variant="outline" className="border-white/30 text-white">
                {image.sceneName}
              </Badge>
            )}
            {(image.remixCount ?? 0) > 0 && (
              <Badge
                variant="secondary"
                className="bg-purple-500/40 text-white border-purple-300/30"
                title={`Remixed ${image.remixCount} time${image.remixCount === 1 ? '' : 's'} by the community`}
                data-testid={`badge-remix-count-${image.id}`}
              >
                🔁 {image.remixCount}
              </Badge>
            )}
          </div>
        </div>

        {/* Right action rail — TikTok-style vertical stack */}
        <div className="absolute right-1.5 sm:right-4 bottom-28 sm:bottom-20 z-10 flex flex-col items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLike(image.id);
            }}
            className={`flex flex-col items-center gap-0.5 min-h-[44px] min-w-[44px] p-2 rounded-full bg-black/40 backdrop-blur-sm transition-transform active:scale-90 ${
              likedImages.has(image.id) ? 'text-red-500' : 'text-white'
            }`}
            data-testid={`button-like-${image.id}`}
          >
            <Heart className={`h-7 w-7 ${likedImages.has(image.id) ? 'fill-current' : ''}`} />
            <span className="text-xs font-semibold">{image.likes || 0}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(image);
            }}
            className="flex flex-col items-center min-h-[44px] min-w-[44px] p-2 rounded-full bg-black/40 backdrop-blur-sm text-white transition-transform active:scale-90"
            title="Download"
            data-testid={`button-download-${image.id}`}
          >
            <Download className="h-6 w-6" />
          </button>
          {image.generationId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUpscaleClick();
              }}
              className="flex flex-col items-center min-h-[44px] min-w-[44px] p-2 rounded-full bg-black/40 backdrop-blur-sm text-white transition-transform active:scale-90"
              title="Upscale"
              data-testid={`button-upscale-${image.id}`}
            >
              <Sparkles className="h-6 w-6" />
            </button>
          )}
          {!isMobile && image.prompt && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsViewingPrompt(true);
              }}
              title="View full prompt"
              className="flex flex-col items-center min-h-[44px] min-w-[44px] p-2 rounded-full bg-black/40 backdrop-blur-sm text-white transition-transform active:scale-90"
              data-testid={`button-view-prompt-${image.id}`}
            >
              <FileText className="h-6 w-6" />
            </button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center min-h-[44px] min-w-[44px] p-2 rounded-full bg-black/40 backdrop-blur-sm text-white/80 transition-transform active:scale-90"
                title="Report"
                data-testid={`button-delete-${image.id}`}
              >
                <Trash2 className="h-6 w-6" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-dark-card border-dark-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-white">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Report Inappropriate Content
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400">
                  This will remove the image from the feed for violating community guidelines or company policy. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-dark-border text-slate-400 hover:text-white hover:border-white/20">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(image);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  data-testid={`confirm-delete-${image.id}`}
                >
                  Report & Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Bottom Info — kept clear of the action rail */}
        <div className="absolute bottom-0 left-0 right-16 sm:right-24 p-4 pb-20 sm:pb-4 text-white">
          <div className="flex flex-col max-w-md">
            {image.sceneName && (
              <span className="text-xs opacity-80">{image.sceneName}</span>
            )}
            {/* Show username for admin only when viewing images NOT created by them */}
            {isAdmin && currentUserId && image.userId !== currentUserId && image.userDisplayName && (
              <span className="text-xs text-purple-300 mt-1 flex items-center gap-1">
                <User className="h-3 w-3" />
                {image.userDisplayName}
              </span>
            )}
            {/* Show character description on desktop */}
            {!isMobile && image.characterName && availableCharacters && (() => {
              const character = availableCharacters.find(char => char.name === image.characterName);
              return character?.description && (
                <p className="text-xs opacity-70 mt-1 leading-relaxed">
                  {character.description}
                </p>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Character & Scene Edit Dialog */}
      <Dialog open={isEditingCharacter} onOpenChange={setIsEditingCharacter}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Image Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Character Name</label>
              <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a character..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableCharacters?.filter(c => c.name && c.name.trim() !== '').map((character) => (
                    <SelectItem key={character.id} value={character.name}>
                      {character.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Scene Description</label>
              {!isCustomScene ? (
                <Select 
                  value={selectedScene || '__custom__'} 
                  onValueChange={(value) => {
                    if (value === '__custom__') {
                      setIsCustomScene(true);
                      setSelectedScene('');
                      setCustomScene('');
                    } else if (value === '__none__') {
                      setSelectedScene('');
                      setCustomScene('');
                    } else {
                      setSelectedScene(value);
                    }
                  }}
                >
                  <SelectTrigger data-testid={`select-scene-${image.id}`}>
                    <SelectValue placeholder="Select a scene..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="__custom__">✏️ Type new scene...</SelectItem>
                    {availableScenes.filter(scene => scene && scene.trim() !== '').map((scene) => (
                      <SelectItem key={scene} value={scene}>
                        {scene}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customScene}
                    onChange={(e) => {
                      setCustomScene(e.target.value);
                      setSelectedScene(e.target.value);
                    }}
                    placeholder="e.g., mountain hiking trail 001"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid={`input-scene-${image.id}`}
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCustomScene(false);
                      setCustomScene('');
                      setSelectedScene('');
                    }}
                    className="w-full"
                  >
                    ← Back to scene list
                  </Button>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Content Rating</label>
              <Select value={selectedRating} onValueChange={(v) => setSelectedRating(v as typeof selectedRating)}>
                <SelectTrigger data-testid={`select-rating-${image.id}`}>
                  <SelectValue placeholder="Select rating..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="G">G - General Audiences</SelectItem>
                  <SelectItem value="PG">PG - Parental Guidance</SelectItem>
                  <SelectItem value="PG-13">PG-13 - Parents Strongly Cautioned</SelectItem>
                  <SelectItem value="R">R - Restricted</SelectItem>
                  <SelectItem value="NC-17">NC-17 - Adults Only</SelectItem>
                  <SelectItem value="X">X - Explicit Content</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditingCharacter(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onEditCharacter(image.id, selectedCharacter, selectedScene, selectedRating);
                  setIsEditingCharacter(false);
                }}
                className="flex-1"
                data-testid={`button-save-character-${image.id}`}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Prompt Dialog - Desktop Only */}
      <Dialog open={isViewingPrompt} onOpenChange={setIsViewingPrompt}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Full Prompt</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Positive Prompt</label>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words bg-slate-900/50 p-4 rounded-md">
                  {image.prompt || 'No prompt available'}
                </p>
              </div>
              {image.negativePrompt && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Negative Prompt</label>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words bg-slate-900/50 p-4 rounded-md">
                    {image.negativePrompt}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setIsViewingPrompt(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upscale Modal - Mobile Optimized */}
      <Dialog open={showUpscaleModal} onOpenChange={setShowUpscaleModal}>
        <DialogContent className="bg-dark-card border-dark-border max-w-md w-[95vw] max-h-[90vh] overflow-y-auto overscroll-contain">
          <button
            onClick={() => setShowUpscaleModal(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-50"
            data-testid="button-close-upscale-modal"
          >
            <X className="h-5 w-5 text-slate-400 hover:text-white" />
            <span className="sr-only">Close</span>
          </button>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Upscale Image
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {upscaleModel === 'realesrgan' 
                ? 'Upscale your image using AI-powered Real-ESRGAN technology. Each upscale costs 5 Buzz credits.'
                : 'Upscale facial features using GFPGAN face restoration technology. Each upscale costs 5 Buzz credits.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Enhancement Model Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white">Upscaling Model</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setUpscaleModel('realesrgan')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    upscaleModel === 'realesrgan'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-dark-border hover:border-purple-400/50'
                  }`}
                  data-testid="button-model-realesrgan"
                >
                  <div className="text-lg font-bold text-white">Real-ESRGAN</div>
                  <div className="text-xs text-slate-400">General upscaling</div>
                </button>
                <button
                  onClick={() => setUpscaleModel('gfpgan')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    upscaleModel === 'gfpgan'
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
                  onClick={() => setUpscaleScale(2)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    upscaleScale === 2
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-dark-border hover:border-purple-400/50'
                  }`}
                  data-testid="button-scale-2x"
                >
                  <div className="text-lg font-bold text-white">2x</div>
                  <div className="text-xs text-slate-400">Double resolution</div>
                </button>
                <button
                  onClick={() => setUpscaleScale(4)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    upscaleScale === 4
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
            {upscaleModel === 'realesrgan' && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-dark-bg border border-dark-border">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-white">Face Upscaling</div>
                  <div className="text-xs text-slate-400">
                    Apply additional upscaling to facial features
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
                  5 Buzz Credits
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowUpscaleModal(false)}
              className="border-dark-border text-slate-400 hover:text-white w-full sm:w-auto min-h-[44px]"
              data-testid="button-cancel-upscale"
            >
              Cancel
            </Button>
            <Button
              onClick={submitUpscale}
              disabled={upscaleMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto min-h-[44px]"
              data-testid="button-submit-upscale"
            >
              {upscaleMutation.isPending ? 'Starting...' : 'Upscale Image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
