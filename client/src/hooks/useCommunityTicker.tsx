// useCommunityTicker hook completely disabled to fix rapid image update issue
// Hook temporarily removed

import { useState, useEffect } from 'react';
import { Generation, SharedImage } from '@/types';

interface UseCommunityTickerProps {
  communityData: SharedImage[];
  convertToGeneration: (sharedImage: SharedImage) => Generation;
  initialDisplayCount?: number;
}

export function useCommunityTicker({ 
  communityData, 
  convertToGeneration, 
  initialDisplayCount = 20 
}: UseCommunityTickerProps) {
  const [displayList, setDisplayList] = useState<Generation[]>([]);
  const [swappingIndices, setSwappingIndices] = useState<Set<number>>(new Set());

  // Static implementation - NO TIMERS OR ANIMATIONS
  useEffect(() => {
    if (communityData.length === 0) {
      setDisplayList([]);
      return;
    }

    // Simply show first 20 images, no shuffling or updating
    const staticDisplay = communityData.slice(0, initialDisplayCount);
    setDisplayList(staticDisplay.map(convertToGeneration));
  }, [communityData, convertToGeneration, initialDisplayCount]);

  return {
    displayList,
    swappingIndices: new Set<number>(), // Always empty
    isReady: displayList.length > 0
  };
}