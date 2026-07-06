import { Generation, SharedImage } from '@/types';

// Helper functions for persistent active generations
export const saveActiveGenerationsToStorage = (generations: Map<string, { generation: Generation; progress: number; orderedImages: number; returnedImages: number; startTime: number; isCompleted: boolean; completionStartTime?: number }>) => {
  try {
    const serialized = Array.from(generations.entries()).map(([id, data]) => [id, data]);
    localStorage.setItem('activeGenerations', JSON.stringify(serialized));
  } catch (error) {
    console.error('Failed to save active generations:', error);
  }
};

export const loadActiveGenerationsFromStorage = (): Map<string, { generation: Generation; progress: number; orderedImages: number; returnedImages: number; startTime: number; isCompleted: boolean; completionStartTime?: number }> => {
  try {
    const saved = localStorage.getItem('activeGenerations');
    if (saved) {
      const serialized = JSON.parse(saved);
      const result = new Map();

      // Migrate old data format to new format with startTime and isCompleted
      for (const [key, value] of serialized) {
        const migratedValue = {
          ...value,
          // Add default values for new fields if they don't exist
          startTime: value.startTime || (value.generation?.createdAt ? new Date(value.generation.createdAt).getTime() : Date.now()),
          isCompleted: value.isCompleted ?? (value.returnedImages >= value.orderedImages),
          returnedImages: value.returnedImages || 0,
          orderedImages: value.orderedImages || 1,
        };
        result.set(key, migratedValue);
      }

      return result;
    }
  } catch (error) {
    console.error('Failed to load active generations:', error);
    localStorage.removeItem('activeGenerations');
  }
  return new Map();
};

// Helper function to convert SharedImage to Generation format for ImageGallery
export const convertSharedImageToGeneration = (sharedImage: SharedImage): Generation => {
  return {
    id: sharedImage.generationId || sharedImage.id,
    prompt: sharedImage.prompt,
    negativePrompt: sharedImage.negativePrompt || '',
    imageUrl: sharedImage.generationId ? `/api/images/${sharedImage.generationId}` : sharedImage.imageUrl,
    status: 'completed' as const,
    modelId: undefined,
    seed: undefined,
    steps: 28,
    cfgScale: 7 as number,
    width: 832 as number,
    height: 1216 as number,
    scheduler: 'Euler',
    clipSkip: 2,
    quantity: 1,
    loras: [],
    userId: sharedImage.userId,
    createdAt: sharedImage.createdAt,
    characterId: undefined,
    characterName: undefined,
    sceneName: undefined,
    jobId: undefined,
    storedImagePath: undefined,
    cost: 0,
    blobKey: undefined,
    metadata: undefined,
    storedMetadataPath: undefined,
    originalGenerationData: undefined,
    completedAt: undefined
  };
};
