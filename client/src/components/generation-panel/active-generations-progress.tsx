import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Generation } from '@/types';
import type { ActiveGenerationEntry } from './types';

interface ActiveGenerationsProgressProps {
  activeGenerations: Map<string, ActiveGenerationEntry>;
  dismissedProgressBars: Set<string>;
  setDismissedProgressBars: React.Dispatch<React.SetStateAction<Set<string>>>;
  generations: Generation[];
}

export function ActiveGenerationsProgress({
  activeGenerations,
  dismissedProgressBars,
  setDismissedProgressBars,
  generations,
}: ActiveGenerationsProgressProps) {
  return (
        <>
          {Array.from(activeGenerations.values())
            .filter(({ generation }) => !dismissedProgressBars.has(generation.id))
            .map(({ generation, progress: genProgress, orderedImages, returnedImages, isCompleted, completionStartTime, statusMessage }) => {
            // Use the tracked returnedImages count directly (more reliable)
            // Only use API count as backup if we have a valid jobId to match
            const actualCompletedImages = generation.jobId ? generations.filter(g =>
              g.jobId === generation.jobId && g.status === 'completed' && g.imageUrl
            ).length : 0;

            // Use the higher of tracked count or actual API count (if available)
            const completedImages = Math.max(returnedImages || 0, actualCompletedImages);

            // Calculate visual progress:
            // - If complete, animate from 90% to 100% over 20 seconds
            // - If images received, jump to 90%+ (like FipFap)
            // - Otherwise, use time-based progress capped at 89%
            let visualProgress: number;
            if (isCompleted || completedImages >= orderedImages) {
              if (completionStartTime) {
                const timeSinceComplete = Date.now() - completionStartTime;
                const animationProgress = Math.min(timeSinceComplete / 20000, 1); // 20 seconds
                visualProgress = Math.round(90 + (10 * animationProgress));
              } else {
                visualProgress = 90;
              }
            } else if (completedImages > 0) {
              // CRITICAL FIX: When images arrive, show 90%+ (not capped at 89%)
              // This matches FipFap's behavior and gives immediate feedback
              const baseProgress = 90;
              const remainingProgress = 9; // We'll go from 90% to ~99%
              const completionRatio = completedImages / orderedImages;
              visualProgress = Math.floor(baseProgress + (remainingProgress * completionRatio));
            } else {
              // No images yet - use time-based progress capped at 89%
              visualProgress = Math.min(Math.round(genProgress || 10), 89);
            }

            const isComplete = isCompleted || completedImages >= orderedImages;

            return (
            <Card key={generation.id} className="bg-dark-card border-dark-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h3 className={`text-lg font-semibold ${isComplete ? 'text-green-400' : ''}`}>
                      {visualProgress >= 100 ? 'Generation Complete!' : isComplete ? 'Finalizing...' : 'Generating Images...'}
                    </h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Add to dismissed set instead of removing from active (allows auto-cleanup later)
                      setDismissedProgressBars(prev => new Set([...prev, generation.id]));
                    }}
                    className="ml-2 h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-500"
                    data-testid={`button-close-progress-${generation.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-500">Overall Progress:</span>
                  <span className={`text-sm ${isComplete ? 'text-green-400' : 'text-slate-400'}`}>{visualProgress}%</span>
                </div>
                <Progress
                  value={visualProgress}
                  className={`mb-4 ${isComplete ? '[&>div]:bg-green-500' : ''}`}
                  data-testid={`progress-generation-${generation.id}`}
                />
                <p className="text-sm text-slate-400">
                  {isComplete ? 'Images ready!' : completedImages > 0 ? `${completedImages}/${orderedImages} images received` : statusMessage ? statusMessage : 'Estimated time: 2-3 minutes'} • Generation ID: {generation.id.substring(0, 8)}...
                </p>
              </CardContent>
            </Card>
            );
          })}
        </>
  );
}
