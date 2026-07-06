import { Sparkles } from 'lucide-react';
import type { PendingPlaceholderEntry } from './types';

interface PendingPlaceholdersGridProps {
  pendingImagePlaceholders: Map<string, PendingPlaceholderEntry>;
}

export function PendingPlaceholdersGrid({ pendingImagePlaceholders }: PendingPlaceholdersGridProps) {
  return (
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1 sm:gap-2 mb-4">
              {Array.from(pendingImagePlaceholders.values()).flatMap((placeholder) =>
                Array.from({ length: placeholder.count }).map((_, i) => {
                  // First readyCount items are "ready" (green), rest are "pending" (purple)
                  const isReady = i < placeholder.readyCount;

                  return (
                    <div
                      key={`placeholder-${placeholder.batchId}-${i}`}
                      className={`aspect-square rounded border flex items-center justify-center transition-all duration-500 ${
                        isReady
                          ? 'bg-green-500/10 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                          : 'bg-gradient-to-b from-gray-800 to-gray-900 border-purple-500/30'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-0.5 p-0.5 sm:p-2 text-center">
                        <div className="relative w-4 h-4 sm:w-8 sm:h-8">
                          {isReady ? (
                            <>
                              <div className="w-4 h-4 sm:w-8 sm:h-8 border-2 border-green-500/30 rounded-full"></div>
                              <div className="absolute inset-0 w-4 h-4 sm:w-8 sm:h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                              <Sparkles className="absolute inset-0 m-auto h-2 w-2 sm:h-4 sm:w-4 text-green-400 animate-pulse" />
                            </>
                          ) : (
                            <>
                              <div className="w-4 h-4 sm:w-8 sm:h-8 border-2 border-purple-500/30 rounded-full"></div>
                              <div className="absolute inset-0 w-4 h-4 sm:w-8 sm:h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                            </>
                          )}
                        </div>
                        <span className={`text-[10px] sm:text-xs font-medium ${isReady ? 'text-green-400' : 'text-gray-400'}`}>
                          {isReady ? 'Ready!' : 'Generating...'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
  );
}
