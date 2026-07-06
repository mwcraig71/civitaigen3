import { Generation } from '@/types';

export interface GenerationPanelProps {
  onImageClick: (generation: Generation) => void;
}

// Shape of one tracked active generation (mirrors the inline type used by
// GenerationPanel's activeGenerations state).
export interface ActiveGenerationEntry {
  generation: Generation;
  progress: number;
  orderedImages: number;
  returnedImages: number;
  startTime: number;
  isCompleted: boolean;
  completionStartTime?: number; // When images completed - for 90%→100% animation
  statusMessage?: string; // Queue / status message from server (e.g. "Queued — est. 3m")
}

// Shape of one pending image placeholder entry (mirrors the inline type used
// by GenerationPanel's pendingImagePlaceholders state).
export interface PendingPlaceholderEntry {
  batchId: string;
  count: number;
  readyCount: number; // Images ready from API but not yet rendered
  startTime: number;
  prompt?: string;
}
