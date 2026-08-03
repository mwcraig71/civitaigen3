export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  bio?: string | null;
  profileImage?: string | null;
  coverImage?: string | null;
  website?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  deviantart?: string | null;
  buzzCredits: number;
  totalGenerated: number;
  totalModelsShared?: number;
  totalFollowers?: number;
  totalFollowing?: number;
  isSupporter?: boolean;
  supporterLevel?: number;
  reputation?: number;
  isVerified?: boolean;
  isAdmin?: boolean;
  isLocked?: boolean;
  lockedAt?: string | null;
  lockedBy?: string | null;
  lockReason?: string | null;
  showNSFW?: boolean;
  showWatermark?: boolean;
  emailNotifications?: boolean;
  defaultLandingPage?: string;
  civitaiApiKey?: string | null;
  platformGenerations?: number;
  modelsUsed?: number;
  createdAt: string;
  lastActiveAt?: string;
  profileImageUrl?: string | null; // For Replit Auth
  firstName?: string | null;
  lastName?: string | null;
  googleSub?: string | null;
  authProvider?: string;
  emailVerified?: boolean;
  lastLoginAt?: string;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  type: string;
  baseModel?: string;
  rating: number;
  downloads: number;
  civitaiId?: string;
  modelVersion?: string;
  arn?: string;
  imageUrl?: string;
  strengthMin?: number;
  strengthMax?: number;
  activationWords?: string[];
  loraCategory?: string | null; // "character" | "style" | null — admin-set canonical grouping
  createdAt: string;
}

export interface Generation {
  id: string;
  userId?: string;
  modelId?: string;
  characterId?: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  scheduler: string;
  clipSkip: number;
  quantity?: number;
  loras?: Array<{id: string; strength: number}>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  jobId?: string;
  imageUrl?: string;
  blobKey?: string;
  cost: number;
  metadata?: any;
  // File storage fields for structured naming
  characterName?: string;
  sceneName?: string;
  storedImagePath?: string;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  storedMetadataPath?: string;
  generationType?: 'txt2img' | 'img2img' | 'img2vid';
  sourceImageUrl?: string;
  denoiseStrength?: number;
  videoDurationSeconds?: number;
  videoFps?: number;
  videoModelEngine?: string;
  originalGenerationData?: {
    prompt: string;
    negativePrompt?: string;
    modelId: string;
    seed?: number;
    seedIncrement?: number;
    steps: number;
    cfgScale: number;
    width: number;
    height: number;
    scheduler: string;
    clipSkip: number;
    quantity: number;
    loras?: Array<{id: string; strength: number}>;
    civitaiJobData?: any;
  };
  createdAt: string;
  completedAt?: string;
}

export interface GenerationFormData {
  modelId: string;
  characterId?: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  seedIncrement?: number; // Configurable seed increment for multiple images
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  scheduler: string;
  clipSkip: number;
  quantity: number;
  loras: Array<{id: string; strength: number}>;
}

export interface WebSocketMessage {
  type: 'generation_update' | 'generation_complete' | 'generation_image_ready' | 'generation_batch_complete' | 'generation_delay_warning' | 'buzz_awarded' | 'error';
  generationId?: string;
  batchId?: string;
  imageId?: string;
  originalGenerationId?: string;
  status?: string;
  progress?: number;
  imageUrl?: string;
  totalImages?: number;
  error?: string;
  message?: string;
  statusMessage?: string;
  amount?: number;
}

export interface SharedImage {
  id: string;
  userId: string;
  userDisplayName?: string;
  remixCount?: number;
  modelId?: string | null;
  characterId?: string | null;
  generationId?: string;
  title?: string;
  prompt: string;
  negativePrompt?: string;
  modelUsed?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  tags?: string[];
  isNSFW: boolean;
  likes: number;
  downloads: number;
  views: number;
  featured: boolean;
  characterName?: string | null;
  sceneName?: string | null;
  category?: string;
  rating?: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17' | 'X';
  createdAt: string;
  // Technical generation details
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  scheduler?: string;
  clipSkip?: number;
  loras?: Array<{
    id: string;
    name: string;
    strength: number;
  }>;
}


// Authenticated session user as returned by /api/auth/user
export interface AuthUser {
  id: string;
  username?: string;
  email?: string;
  displayName?: string | null;
  profileImage?: string | null;
  profileImageUrl?: string | null;
  isAdmin?: boolean;
  buzzCredits?: number;
  showWatermark?: boolean;
  platformGenerations?: number;
  upscaleCount?: number;
  civitaiApiKey?: string | null;
  defaultLandingPage?: string | null;
}
