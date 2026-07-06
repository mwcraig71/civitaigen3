// CivitAI API integration for models and image generation

export interface CivitAIModel {
  id: number;
  name: string;
  description?: string;
  type: string;
  stats: {
    downloadCount: number;
    rating: number;
    ratingCount: number;
  };
  modelVersions: Array<{
    id: number;
    name: string;
    baseModel?: string;
    files: Array<{
      name: string;
      type: string;
      metadata?: {
        fp?: string;
        size?: string;
        format?: string;
      };
    }>;
  }>;
  tags: string[];
  creator: {
    username: string;
  };
}

export interface CivitAIGenerationRequest {
  modelArn: string;
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  width?: number;
  height?: number;
  scheduler?: string;
  seed?: number;
  clipSkip?: number;
}

export interface CivitAIGenerationResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  cost: number;
  imageUrl?: string;
  blobKey?: string;
}

// CivitAI API client for fetching models and generating images
export class CivitAIClient {
  private baseUrl = 'https://civitai.com/api/v1';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || '';
  }

  async fetchModels(page = 1, limit = 100, types = ['Checkpoint', 'LORA', 'TextualInversion']): Promise<{
    items: CivitAIModel[];
    metadata: { totalItems: number; currentPage: number; pageSize: number; totalPages: number };
  }> {
    try {
      const typeParams = types.map(type => `types=${type}`).join('&');
      const url = `${this.baseUrl}/models?limit=${limit}&page=${page}&${typeParams}&sort=Highest Rated&period=AllTime&nsfw=false`;
      
      const response = await fetch(url, {
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching models from CivitAI:', error);
      // Return empty result on error
      return {
        items: [],
        metadata: { totalItems: 0, currentPage: 1, pageSize: limit, totalPages: 0 }
      };
    }
  }

  async generateImage(request: CivitAIGenerationRequest): Promise<CivitAIGenerationResponse> {
    // For development, simulate response since we need CivitAI API key for actual generation
    return {
      jobId: `job-${Date.now()}`,
      status: 'pending',
      cost: 5,
    };
  }

  async getJobStatus(jobId: string): Promise<CivitAIGenerationResponse> {
    // Mock implementation - in production this would check actual job status
    return {
      jobId,
      status: 'processing',
      cost: 5,
    };
  }
}

export const civitaiClient = new CivitAIClient();
