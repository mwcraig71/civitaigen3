import { logger } from "./logger";
const DIFFUS_API_URL = "https://sd-api.diffus.me/api/v3";

export interface DiffusGenerationParams {
  prompt: string;
  negativePrompt?: string;
  modelName?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  enableNsfw?: boolean;
  clipSkip?: number;
}

export interface DiffusGenerationResult {
  taskId: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  imageUrl?: string;
  allImages?: string[]; // All available images for progressive batch processing
  isComplete?: boolean; // True when batch is fully complete (status=3)
  error?: string;
  progress?: number;
  seed?: number;
}

export interface DiffusGenerationRequest {
  model: string;
  params: {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    scheduler?: string;
    clipSkip?: number;
    seed?: number;
    loras?: Array<{id: string; strength: number}>;
  };
  generationType?: "txt2img" | "img2img";
  batchSize?: number;
}

const SCHEDULER_MAPPING: { [key: string]: string } = {
  'Euler': 'Euler',
  'Euler a': 'Euler a',
  'DPM++ 2M': 'DPM++ 2M',
  'DPM++ 2M Karras': 'DPM++ 2M Karras',
  'DPM++ 2M SDE': 'DPM++ 2M SDE',
  'DPM++ 2M SDE Karras': 'DPM++ 2M SDE Karras',
  'DPM++ SDE': 'DPM++ SDE',
  'DPM++ SDE Karras': 'DPM++ SDE Karras',
  'DDIM': 'DDIM',
  'UniPC': 'UniPC',
  'LCM': 'LCM',
  'Heun': 'Heun',
};

function convertSchedulerToDiffus(uiScheduler: string): string {
  const mapped = SCHEDULER_MAPPING[uiScheduler];
  if (mapped) {
    return mapped;
  }
  return 'DPM++ 2M SDE';
}

export class DiffusService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DIFFUS_API_KEY || '';
  }

  private getApiKey(): string {
    return this.apiKey;
  }

  async createGeneration(request: DiffusGenerationRequest): Promise<{ taskId: string; cost: number }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("DIFFUS_API_KEY environment variable is not set");
    }

    const safeWidth = Math.max(512, Math.min(1536, request.params.width || 832));
    const safeHeight = Math.max(512, Math.min(1536, request.params.height || 1216));
    const safeCfgScale = Math.max(1, Math.min(20, request.params.cfgScale || 4.5));
    const safeSteps = Math.max(1, Math.min(150, request.params.steps || 28));

    const requestBody = {
      prompt: request.params.prompt,
      negative_prompt: request.params.negativePrompt || "worst quality, low quality, blurry",
      model_name: request.model || "cyberrealisticPony_v150.safetensors",
      sampler_name: convertSchedulerToDiffus(request.params.scheduler || "DPM++ 2M SDE"),
      steps: safeSteps,
      cfg_scale: safeCfgScale,
      width: safeWidth,
      height: safeHeight,
      seed: request.params.seed && request.params.seed > 0 ? request.params.seed : -1,
      clip_skip: request.params.clipSkip || 2,
      batch_size: Math.max(1, Math.min(4, request.batchSize || 1)),
      n_iter: 1,
      enable_nsfw: true
    };

    logger.info(`🎨 [Diffus] Submitting generation request:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${DIFFUS_API_URL}/txt2img`, {
      method: "POST",
      headers: {
        "x-diffus-passkey": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error(`🚨 [Diffus] API error:`, responseText);
      throw new Error(`Diffus API error: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    const taskId = data.data?.task_id;

    if (!taskId) {
      logger.error(`🚨 [Diffus] No task_id in response:`, data);
      throw new Error("No task_id returned from Diffus API");
    }

    logger.info(`✅ [Diffus] Generation submitted, taskId: ${taskId}`);

    return { 
      taskId, 
      cost: 0.5 
    };
  }

  async checkStatus(taskId: string): Promise<DiffusGenerationResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("DIFFUS_API_KEY environment variable is not set");
    }

    const response = await fetch(`${DIFFUS_API_URL}/progress?task_id=${taskId}`, {
      headers: {
        "x-diffus-passkey": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Diffus API error: ${response.status}`);
    }

    const data = await response.json();
    const status = data.data?.status;
    const imgs = data.data?.imgs || [];
    const failedReason = data.data?.failed_reason;
    const progress = data.data?.progress || 0;
    const seedInfo = data.data?.seed;

    logger.info(`📊 [Diffus] Status check for ${taskId}: status=${status}, progress=${progress}%, images=${imgs.length}`);

    // Return all available images for progressive batch processing
    if ((status === 2 || status === 3) && imgs.length > 0) {
      return {
        taskId,
        status: status === 3 ? "succeeded" : "processing",
        imageUrl: imgs[0],
        allImages: imgs, // All available images for batch processing
        isComplete: status === 3,
        seed: seedInfo
      };
    }

    if (status === -2 || (failedReason && failedReason.length > 0)) {
      return {
        taskId,
        status: "failed",
        error: failedReason || "Generation failed"
      };
    }

    if (status === 0 || status === 1) {
      return {
        taskId,
        status: "processing",
        progress: progress
      };
    }

    return {
      taskId,
      status: "pending",
      progress: 0
    };
  }

  async generateImageAndWait(
    request: DiffusGenerationRequest,
    timeoutMs: number = 300000
  ): Promise<{ imageUrl: string; seed?: number }> {
    const { taskId } = await this.createGeneration(request);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.checkStatus(taskId);

      if (result.status === "succeeded" && result.imageUrl) {
        return { imageUrl: result.imageUrl, seed: result.seed };
      }

      if (result.status === "failed") {
        throw new Error(result.error || "Generation failed");
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error("Generation timed out");
  }

  isAvailable(): boolean {
    return !!this.getApiKey();
  }
}

export const diffusService = new DiffusService();
