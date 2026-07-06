import { Generation } from '@/types';
import ImageGallery from './image-gallery';

interface CommunityTickerProps {
  displayList: Generation[];
  swappingIndices: Set<number>;
  onImageClick: (generation: Generation) => void;
  isReady: boolean;
}

export function CommunityTicker({ 
  displayList, 
  swappingIndices, 
  onImageClick, 
  isReady 
}: CommunityTickerProps) {
  if (!isReady) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading community highlights...</div>
      </div>
    );
  }

  // Static display - no animations, no timers, no rapid updates
  return (
    <div className="community-static-display">
      <ImageGallery 
        generations={displayList}
        onImageClick={onImageClick}
        allowMultiSelect={false}
        showViewAll={false}
      />
    </div>
  );
}