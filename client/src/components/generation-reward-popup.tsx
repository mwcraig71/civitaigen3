import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2, Share2, ArrowLeft, X } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface GenerationRewardPopupProps {
  isOpen: boolean;
  onClose: () => void;
  // Structural subset used by this popup; both the client '@/types' and
  // '@shared/schema' Generation types satisfy it.
  generation: {
    prompt: string;
    characterName?: string | null;
    sceneName?: string | null;
    sourceSharedImageId?: string | null;
  };
  generationId: string;
  imageUrl: string;
  offsetIndex?: number;
  isInFipFapMode?: boolean;
}

export function GenerationRewardPopup({ 
  isOpen, 
  onClose, 
  generation, 
  generationId, 
  imageUrl,
  isInFipFapMode = false 
}: GenerationRewardPopupProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [rating, setRating] = useState<string>('R'); // Default to R rating for community visibility
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch source shared image if this is an enhanced image
  const { data: sourceSharedImage } = useQuery({
    queryKey: ['/api/shared-images', generation.sourceSharedImageId],
    queryFn: async () => {
      if (!generation.sourceSharedImageId) return null;
      const response = await fetch(`/api/shared-images/${generation.sourceSharedImageId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!generation.sourceSharedImageId && isOpen,
  });
  
  // Calculate default rating when popup opens or source image loads
  useEffect(() => {
    if (!isOpen) return;
    
    // Always default to R for all new images (for community visibility)
    setRating('R');
    
    // Note: The logic below is preserved for future use if needed
    // If there's a source image, apply rating inheritance logic
    // if (sourceSharedImage) {
    //   const sourceRating = sourceSharedImage.rating || 'R';
    //   
    //   // Rule 1: If enhanced from X-rated image → default to X
    //   if (sourceRating === 'X') {
    //     setRating('X');
    //   }
    //   // Rule 2: If R or lower and enhancement modifiers were used → default to X
    //   else if ((sourceRating === 'R' || sourceRating === 'PG-13' || sourceRating === 'PG' || sourceRating === 'G') && 
    //            generation.prompt && generation.prompt.length > (sourceSharedImage.prompt?.length || 0)) {
    //     // Assume modifiers were used if prompt is longer
    //     setRating('X');
    //   }
    //   // Rule 3: Otherwise inherit the source rating
    //   else {
    //     setRating(sourceRating);
    //   }
    // }
  }, [isOpen, sourceSharedImage, generation]);

  // Delete generation mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/generations/${generationId}`, {
        method: 'DELETE',
      });
      return response.json();
    },
    onMutate: async () => {
      // Close immediately for instant feedback
      onClose();
      
      // Cancel queries and optimistically remove
      await queryClient.cancelQueries({ queryKey: ['/api/generations'] });
      await queryClient.cancelQueries({ queryKey: ['/api/generations/recent'] });
      
      const removeFromCache = (data: any) => {
        if (!data) return data;
        if (Array.isArray(data)) {
          return data.filter((gen: any) => gen.id !== generationId);
        }
        if (data.generations && Array.isArray(data.generations)) {
          return {
            ...data,
            generations: data.generations.filter((gen: any) => gen.id !== generationId),
            total: Math.max(0, (data.total || 0) - 1)
          };
        }
        return data;
      };
      
      queryClient.setQueriesData({ queryKey: ['/api/generations'] }, removeFromCache);
      queryClient.setQueriesData({ queryKey: ['/api/generations/recent'] }, removeFromCache);
      
      toast({ title: "Image deleted" });
    },
    onSuccess: () => {
      // Background sync
      queryClient.invalidateQueries({ queryKey: ['/api/generations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/generations/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
    },
    onError: (error) => {
      console.error('Failed to delete generation:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete the image. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsDeleting(false);
    }
  });

  // Share to community mutation
  const shareMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/shared-images', { 
        generationId,
        rating 
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Shared Successfully",
        description: "Your image has been added to the community gallery.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shared-images'] });
      onClose();
    },
    onError: (error) => {
      console.error('Failed to share to community:', error);
      toast({
        title: "Share Failed",
        description: "Failed to share the image. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSharing(false);
    }
  });

  const handleDelete = () => {
    setIsDeleting(true);
    deleteMutation.mutate();
  };

  const handleShare = () => {
    if (!generationId) {
      console.error('Cannot share: generationId is missing');
      toast({
        title: "Share Failed",
        description: "Image data is incomplete. Please try again.",
        variant: "destructive",
      });
      return;
    }
    setIsSharing(true);
    shareMutation.mutate();
  };

  const handleBackToFipFap = () => {
    onClose();
    setLocation('/fip-fap');
  };

  // FipFap close handler - just close without scroll manipulation
  // The FipFap container manages its own snap-scroll behavior
  const handleFipFapClose = () => {
    onClose();
  };

  // Full-screen FipFap-style viewer
  if (isInFipFapMode) {
    return (
      <div className={`fixed inset-0 z-[100] bg-black transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Full-screen image */}
        <div className="h-full w-full flex items-center justify-center">
          <img
            src={imageUrl}
            alt="Generated Image"
            className="max-h-full w-auto object-contain"
            data-testid="fullscreen-generated-image"
          />
        </div>

        {/* Close button - top right */}
        <button
          onClick={handleFipFapClose}
          className="absolute top-4 right-4 z-[110] p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors pointer-events-auto cursor-pointer"
          data-testid="button-close-fullscreen"
        >
          <X className="h-6 w-6 text-white" />
        </button>

        {/* Success message and info overlay - top center */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[110] text-center pointer-events-auto">
          <div className="bg-green-500/90 text-white px-6 py-3 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-1">🎉 Generation Complete!</h2>
            <p className="text-sm">Saved to your gallery</p>
            <p className="text-xs mt-1 opacity-90">To see all your generated images visit your gallery</p>
          </div>
        </div>

        {/* Character/Scene info - bottom left */}
        {(generation.characterName || generation.sceneName) && (
          <div className="absolute bottom-24 left-4 text-white text-shadow z-10">
            {generation.characterName && (
              <p className="text-lg font-semibold">{generation.characterName}</p>
            )}
            {generation.sceneName && (
              <p className="text-sm text-gray-300">{generation.sceneName}</p>
            )}
          </div>
        )}

        {/* Action buttons - bottom center */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[110] flex gap-4 pointer-events-auto">
          <Button
            onClick={handleShare}
            disabled={isSharing || isDeleting}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 cursor-pointer"
            data-testid="button-share-to-community"
          >
            <Share2 className="h-5 w-5 mr-2" />
            {isSharing ? 'Sharing...' : 'Share to Community'}
          </Button>
          
          <Button
            onClick={handleDelete}
            disabled={isDeleting || isSharing}
            variant="destructive"
            size="lg"
            className="px-8 cursor-pointer"
            data-testid="button-delete-generation"
          >
            <Trash2 className="h-5 w-5 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    );
  }

  // Regular modal view (for non-FipFap mode)
  // iOS Safari fix: Use a global reference counter for body overflow lock
  // This prevents multiple popups from interfering with each other
  useEffect(() => {
    if (isOpen) {
      // Increment the global popup counter
      const currentCount = parseInt(document.body.dataset.popupCount || '0', 10);
      document.body.dataset.popupCount = String(currentCount + 1);
      document.body.style.overflow = 'hidden';
      console.log('📱 Popup opened - iOS fix applied, count:', currentCount + 1);
    }
    
    return () => {
      // Decrement the popup counter on close
      const currentCount = parseInt(document.body.dataset.popupCount || '1', 10);
      const newCount = Math.max(0, currentCount - 1);
      document.body.dataset.popupCount = String(newCount);
      
      // Only restore overflow when all popups are closed
      if (newCount === 0) {
        document.body.style.overflow = '';
        // iOS Safari fix: Reset scroll to top position to prevent navigation icons being cut off
        // This ensures the view returns to a default position after popup closes
        window.scrollTo(0, 0);
        console.log('📱 All popups closed - overflow restored, scroll reset to top');
      }
    };
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent 
        className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-4"
        style={{
          WebkitOverflowScrolling: 'touch',
          WebkitTransform: 'translate(-50%, -50%)',
          position: 'fixed'
        }}
      >
        <DialogHeader className="flex-none">
          <DialogTitle className="text-center">Generation Complete!</DialogTitle>
        </DialogHeader>

        {/* Back to Fip Fap Button */}
        <div className="flex justify-center mb-2 flex-none">
          <Button
            onClick={handleBackToFipFap}
            variant="outline"
            className="flex items-center gap-2 h-8 px-3 text-xs"
            data-testid="button-back-to-fip-fap"
          >
            <ArrowLeft className="h-3.3 w-3.3" />
            Back to Fip Fap
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col space-y-4">
          {/* Image Display - Large Center */}
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black/5 rounded-lg overflow-hidden relative group">
            <img 
              src={imageUrl} 
              alt="Generated Image"
              className="max-w-full max-h-full w-auto h-auto object-contain shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
              data-testid="reward-popup-image"
            />
          </div>

          {/* Bottom Controls Area */}
          <div className="flex-none space-y-4 pt-2">
            {/* Image Info */}
            {generation.characterName && (
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-foreground">{generation.characterName}</span>
                {generation.sceneName && <span className="opacity-80"> • {generation.sceneName}</span>}
              </div>
            )}

            <p className="text-xs text-center text-blue-600 dark:text-blue-400 font-medium opacity-80">
              To see all your generated images visit your gallery
            </p>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center max-w-lg mx-auto w-full">
              <Button
                onClick={handleShare}
                disabled={isSharing || isDeleting}
                className="flex-1 h-12 text-base font-bold shadow-lg bg-primary hover:bg-primary/90"
                data-testid="button-share-community"
              >
                <Share2 className="h-5 w-5 mr-2" />
                {isSharing ? 'Sharing...' : 'Share to Community'}
              </Button>
              
              <Button
                onClick={handleDelete}
                disabled={isDeleting || isSharing}
                variant="destructive"
                className="px-6 h-12 shadow-lg"
                data-testid="button-delete-image"
              >
                <Trash2 className="h-5 w-5 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
