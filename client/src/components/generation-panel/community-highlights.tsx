import { Link } from 'wouter';
import { ExternalLink, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommunityTicker } from '@/components/CommunityTicker';
import { useCommunityTicker } from '@/hooks/useCommunityTicker';
import { Generation } from '@/types';

interface CommunityHighlightsProps {
  communityTicker: ReturnType<typeof useCommunityTicker>;
  onImageClick: (generation: Generation) => void;
}

export function CommunityHighlights({ communityTicker, onImageClick }: CommunityHighlightsProps) {
  return (
        <div className="relative community-gallery-container mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-500" />
              <h3 className="text-lg font-semibold">Community Highlights</h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Static</span>
              </div>
            </div>
            <Link href="/community">
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-500 hover:text-primary-400 flex items-center gap-2"
                data-testid="link-view-all-community"
              >
                View All Community
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="min-h-[300px]">
            <CommunityTicker
              displayList={communityTicker.displayList}
              swappingIndices={communityTicker.swappingIndices}
              onImageClick={onImageClick}
              isReady={communityTicker.isReady}
            />
          </div>
        </div>
  );
}
