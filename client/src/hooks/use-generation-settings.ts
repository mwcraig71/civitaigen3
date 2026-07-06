import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Model } from '@/types';

// Generation schema - same as in GenerationPanel
export const generationSchema = z.object({
  modelId: z.string().min(1, "Please select a model"),
  characterId: z.string().optional(),
  prompt: z.string().min(1, "Prompt is required"),
  negativePrompt: z.string().optional(),
  seed: z.number().optional(),
  seedIncrement: z.union([z.number().int().min(1).max(100), z.undefined()]).default(3),
  steps: z.number().min(1).max(150),
  cfgScale: z.number().min(1).max(30),
  width: z.number(),
  height: z.number(),
  scheduler: z.string(),
  clipSkip: z.number().min(1).max(12),
  quantity: z.number().int().min(1).max(12),
  loras: z.array(z.object({
    id: z.string(),
    strength: z.number().min(-2).max(2)
  })).optional().default([]),
});

export type GenerationFormData = z.infer<typeof generationSchema>;

// Default generation settings
export const DEFAULT_GENERATION_SETTINGS: GenerationFormData = {
  modelId: '', // Will be auto-selected to CyberRealistic Pony when available
  prompt: 'masterpiece, best quality, 1girl, portrait, beautiful detailed eyes, long flowing hair, fantasy background, soft lighting, highly detailed',
  negativePrompt: 'worst quality, low quality, blurry, deformed, disfigured, ugly',
  seed: -1,
  seedIncrement: 3,
  steps: 28,
  cfgScale: 4.5,
  width: 832,
  height: 1216,
  scheduler: 'Euler',
  clipSkip: 2,
  quantity: 4,
  loras: [],
};

interface UseGenerationSettingsOptions {
  storagePrefix?: string;
  enableAutoSave?: boolean;
  enableLoRAValidation?: boolean;
}

export function useGenerationSettings(options: UseGenerationSettingsOptions = {}) {
  const {
    storagePrefix = 'generationPanel',
    enableAutoSave = true,
    enableLoRAValidation = true
  } = options;
  
  const { toast } = useToast();

  // Fetch models for LoRA validation and auto-selection
  const { data: allModels = [] } = useQuery<Model[]>({
    queryKey: ['/api/models'],
    staleTime: 12 * 60 * 60 * 1000, // 12 hours - models rarely change
    refetchInterval: false,
  });

  // Get saved values from localStorage with defaults
  const getSavedValue = (key: string, defaultValue: any) => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`${storagePrefix}_${key}`);
      if (saved !== null && saved.trim() !== '') {
        try {
          return JSON.parse(saved);
        } catch {
          return saved;
        }
      }
    }
    return defaultValue;
  };

  // Save form values to localStorage
  const saveToLocalStorage = (key: string, value: any) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${storagePrefix}_${key}`, JSON.stringify(value));
    }
  };

  // Initialize form with saved values
  const form = useForm<GenerationFormData>({
    resolver: zodResolver(generationSchema),
    defaultValues: {
      modelId: getSavedValue('modelId', DEFAULT_GENERATION_SETTINGS.modelId),
      prompt: getSavedValue('prompt', DEFAULT_GENERATION_SETTINGS.prompt),
      negativePrompt: getSavedValue('negativePrompt', DEFAULT_GENERATION_SETTINGS.negativePrompt),
      seed: getSavedValue('seed', DEFAULT_GENERATION_SETTINGS.seed),
      seedIncrement: getSavedValue('seedIncrement', DEFAULT_GENERATION_SETTINGS.seedIncrement),
      steps: getSavedValue('steps', DEFAULT_GENERATION_SETTINGS.steps),
      cfgScale: getSavedValue('cfgScale', DEFAULT_GENERATION_SETTINGS.cfgScale),
      width: getSavedValue('width', DEFAULT_GENERATION_SETTINGS.width),
      height: getSavedValue('height', DEFAULT_GENERATION_SETTINGS.height),
      scheduler: getSavedValue('scheduler', DEFAULT_GENERATION_SETTINGS.scheduler),
      clipSkip: getSavedValue('clipSkip', DEFAULT_GENERATION_SETTINGS.clipSkip),
      quantity: getSavedValue('quantity', DEFAULT_GENERATION_SETTINGS.quantity),
      loras: getSavedValue('loras', DEFAULT_GENERATION_SETTINGS.loras),
    },
  });

  // Auto-select CyberRealistic Pony as default model
  const autoSelectPreferredModel = () => {
    const currentModelId = form.watch('modelId');
    
    console.log('🔍 useGenerationSettings - Auto-selection check:', {
      modelsLength: allModels.length,
      currentModelId,
      storagePrefix
    });
    
    // Force clear wrong modelId from localStorage
    const wrongModelId = '3feab0ad-5ea6-45bf-9fd6-abc4e396fc4b'; // majicMIX realistic
    if (currentModelId === wrongModelId) {
      console.log('🧹 useGenerationSettings - Clearing wrong model from localStorage');
      localStorage.removeItem(`${storagePrefix}_modelId`);
      form.setValue('modelId', '');
    }
    
    // Auto-select if no model or wrong model is selected and we have models loaded
    const shouldAutoSelect = (!currentModelId || currentModelId === '' || currentModelId === wrongModelId) && allModels.length > 0;
    
    if (shouldAutoSelect) {
      // Look for EXACT "CyberRealistic Pony" model first - use the known ID
      let preferredModel = allModels.find(model => 
        model.id === '3c4e0676-03d8-41d0-9eb8-953d8662b098'
      );
      
      // If not found by ID, look for name match
      if (!preferredModel) {
        preferredModel = allModels.find(model => 
          model.type === 'checkpoint' && 
          model.name.toLowerCase().includes('cyberrealistic pony')
        );
      }
      
      // If still not found, look for any CyberRealistic variant
      if (!preferredModel) {
        preferredModel = allModels.find(model => 
          model.type === 'checkpoint' && 
          model.name.toLowerCase().includes('cyberrealistic')
        );
      }
      
      // Fall back to first checkpoint if nothing found
      if (!preferredModel) {
        preferredModel = allModels.find(model => model.type === 'checkpoint');
      }
      
      if (preferredModel) {
        console.log('🎯 useGenerationSettings - Auto-selecting model:', preferredModel.name, '(', preferredModel.id, ')');
        form.setValue('modelId', preferredModel.id);
        
        // Force trigger form validation to ensure the field is properly registered
        form.trigger('modelId');
        
        // Also save to localStorage to persist the selection
        saveToLocalStorage('modelId', preferredModel.id);
        
        // Double-check that the value was actually set
        setTimeout(() => {
          const verifyModelId = form.getValues('modelId');
          console.log('🔍 useGenerationSettings - Verification: modelId after setValue:', verifyModelId);
          if (verifyModelId !== preferredModel.id) {
            console.log('⚠️ useGenerationSettings - Model ID was not properly set, retrying...');
            form.setValue('modelId', preferredModel.id, { shouldValidate: true, shouldTouch: true });
          }
        }, 100);
      }
    }
  };

  // Clear corrupted LoRA data
  const clearCorruptedLoRAs = () => {
    if (!enableLoRAValidation) return;
    
    const currentLoras = form.watch('loras');
    
    // Check for corrupted data (too many entries). Keep this in sync with
    // MAX_LORAS in client/src/components/lora-selector.tsx.
    if (currentLoras && currentLoras.length > 10) {
      console.log('🧹 Clearing corrupted LoRA data with', currentLoras.length, 'entries');
      form.setValue('loras', []);
      localStorage.removeItem(`${storagePrefix}_loras`);
      toast({
        title: "LoRA Data Cleared",
        description: "Corrupted LoRA data has been cleared. Please reselect your LoRAs.",
        variant: "destructive"
      });
      return;
    }
    
    // Check for invalid LoRA IDs (models that don't exist)
    if (currentLoras && currentLoras.length > 0 && allModels.length > 0) {
      const validLoras = currentLoras.filter(lora => {
        const loraExists = allModels.some(model => model.id === lora.id && model.type === 'lora');
        return loraExists;
      });
      
      if (validLoras.length !== currentLoras.length) {
        const invalidCount = currentLoras.length - validLoras.length;
        console.log(`🧹 Clearing ${invalidCount} invalid LoRA selections after server restart`);
        
        form.setValue('loras', validLoras);
        localStorage.setItem(`${storagePrefix}_loras`, JSON.stringify(validLoras));
        
        toast({
          title: "LoRA Selection Updated",
          description: `Removed ${invalidCount} invalid LoRA selections. Please reselect if needed.`,
        });
      }
    }
  };

  // Auto-select model and validate LoRA data after models load
  useEffect(() => {
    if (allModels.length > 0) {
      // Always try to auto-select preferred model
      autoSelectPreferredModel();
      
      // Only validate LoRAs if enabled
      if (enableLoRAValidation) {
        clearCorruptedLoRAs();
      }
    }
  }, [allModels, enableLoRAValidation]);

  // Auto-save form changes to localStorage
  const watchedValues = form.watch();
  useEffect(() => {
    if (enableAutoSave) {
      Object.entries(watchedValues).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          saveToLocalStorage(key, value);
        }
      });
    }
  }, [watchedValues, enableAutoSave]);

  // Utility function to get current generation data for API calls
  const getGenerationData = (): GenerationFormData => {
    return form.getValues();
  };

  // Utility function to set generation data (useful for loading from existing images)
  const setGenerationData = (data: Partial<GenerationFormData>) => {
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.setValue(key as keyof GenerationFormData, value);
      }
    });
  };

  // Utility function to reset to defaults
  const resetToDefaults = () => {
    form.reset(DEFAULT_GENERATION_SETTINGS);
    // Clear localStorage
    Object.keys(DEFAULT_GENERATION_SETTINGS).forEach(key => {
      localStorage.removeItem(`${storagePrefix}_${key}`);
    });
  };

  return {
    form,
    getGenerationData,
    setGenerationData,
    resetToDefaults,
    clearCorruptedLoRAs,
    DEFAULT_GENERATION_SETTINGS,
  };
}