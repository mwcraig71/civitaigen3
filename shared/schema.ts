import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, json, index, jsonb, real, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Self-learning style profile — accumulated per user by the AI Enhance button.
// Grok inspects each prompt the user enhances and merges what they seem to like
// (art/style directions, favored physical attributes, recurring themes, things
// they avoid) into this profile, which is then fed back into future enhancements.
export interface LearnedStyleProfile {
  styles: string[];             // art style, lighting, mood, rendering, composition preferences
  physicalAttributes: string[]; // hair, body, face, and feature preferences
  themes: string[];             // recurring settings, outfits, scenarios
  avoid: string[];              // tags/ideas the user tends to strip out or dislike
  enhanceCount: number;         // how many enhances have contributed to this profile
  updatedAt: string;            // ISO timestamp of the last learning update
}

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  profileImage: text("profile_image"),
  coverImage: text("cover_image"),
  website: text("website"),
  twitter: text("twitter"),
  instagram: text("instagram"),
  deviantart: text("deviantart"),
  buzzCredits: integer("buzz_credits").default(300), // Updated default for new users
  totalGenerated: integer("total_generated").default(0),
  totalModelsShared: integer("total_models_shared").default(0),
  totalFollowers: integer("total_followers").default(0),
  totalFollowing: integer("total_following").default(0),
  isSupporter: boolean("is_supporter").default(false),
  supporterLevel: integer("supporter_level").default(0), // 0=none, 1=bronze, 2=silver, 3=gold
  reputation: integer("reputation").default(0),
  isVerified: boolean("is_verified").default(false),
  isAdmin: boolean("is_admin").default(false), // Admin role for elevated permissions
  isLocked: boolean("is_locked").default(false), // Account locked by admin
  lockedAt: timestamp("locked_at"), // When account was locked
  lockedBy: varchar("locked_by"), // Admin who locked the account - references users.id
  lockReason: text("lock_reason"), // Reason for locking the account
  showNSFW: boolean("show_nsfw").default(true), // All content on platform is NSFW
  showWatermark: boolean("show_watermark").default(true), // Logo watermark on generated images
  emailNotifications: boolean("email_notifications").default(false), // Default to opt-out for explicit consent
  defaultLandingPage: text("default_landing_page").default("easy-mode"), // "easy-mode" or "generate"
  aiPromptInstructions: text("ai_prompt_instructions"), // Persistent user-provided guidance injected into AI Enhance prompts
  learnedStyleProfile: jsonb("learned_style_profile").$type<LearnedStyleProfile>(), // Self-learning profile of the user's taste, updated by Grok on each AI Enhance
  civitaiApiKey: text("civitai_api_key"), // User's personal CivitAI API key
  platformGenerations: integer("platform_generations").default(0), // Count of generations using platform API key
  upscaleCount: integer("upscale_count").default(0), // Count of images upscaled by this user
  createdAt: timestamp("created_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  // Replit Auth required fields
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  // Google OAuth migration fields (additive, non-destructive)
  googleSub: text("google_sub"), // Google subject ID from OIDC token (unique constraint added via partial index)
  authProvider: text("auth_provider").default("local"), // 'local', 'google', or 'replit'
  emailVerified: boolean("email_verified").default(false), // Email verification status
  lastLoginAt: timestamp("last_login_at").defaultNow(), // Track last login time
  botPassword: text("bot_password"), // Hashed password for bot account login
  freeCreditsLastGivenAt: timestamp("free_credits_last_given_at"), // Last time monthly free credits were topped up
  // Daily reward / streak system
  lastDailyClaimAt: timestamp("last_daily_claim_at"), // Last daily Buzz claim (UTC day granularity)
  dailyStreak: integer("daily_streak").default(0), // Consecutive days claimed
  // Referral program
  referralCode: varchar("referral_code").unique(), // Shareable invite code (generated lazily)
  referredBy: varchar("referred_by"), // userId of the referrer, set once on redemption
  referralCount: integer("referral_count").default(0), // Successful referrals credited to this user
});

export const models = pgTable("models", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // checkpoint, lora, embedding
  baseModel: text("base_model"), // SD 1.5, SDXL, etc
  rating: integer("rating").default(0),
  downloads: integer("downloads").default(0),
  likes: integer("likes").default(0),
  views: integer("views").default(0),
  civitaiId: text("civitai_id"),  // unique constraint now on arn (partial) — see migration in server/index.ts
  modelVersion: text("model_version"),
  arn: text("arn"), // AI Resource Identifier
  imageUrl: text("image_url"), // Cover image from CivitAI
  strengthMin: integer("strength_min").default(-1000), // LoRA strength range min (-10.0 as int * 100)
  strengthMax: integer("strength_max").default(1000), // LoRA strength range max (10.0 as int * 100)
  activationWords: json("activation_words").$type<string[]>(), // Trigger words for LoRAs
  creatorId: varchar("creator_id").references(() => users.id), // Model creator/uploader
  tags: json("tags").$type<string[]>(), // Model tags for categorization
  isNSFW: boolean("is_nsfw").default(false),
  allowCommercialUse: boolean("allow_commercial_use").default(true),
  allowDerivatives: boolean("allow_derivatives").default(true),
  allowDifferentLicense: boolean("allow_different_license").default(true),
  featured: boolean("featured").default(false),
  status: text("status").default("published"), // draft, published, archived
  loraCategory: text("lora_category"), // "character" | "style" | null — admin-set canonical grouping for LoRAs
  generationAllowed: boolean("generation_allowed").default(false), // admin-controlled: whether regular users can pick this model for generation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_models_type").on(table.type),
  index("idx_models_base_model").on(table.baseModel),
  index("idx_models_downloads").on(table.downloads),
  index("idx_models_featured").on(table.featured),
  index("idx_models_name").on(table.name),
]);

export const generations = pgTable("generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  modelId: varchar("model_id").references(() => models.id),
  characterId: varchar("character_id").references((): AnyPgColumn => characters.id), // Track which character was used
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  seed: integer("seed"),
  seedIncrement: integer("seed_increment").default(3), // How much to increment seed for multiple images
  useFirstImageSeedOffset: boolean("use_first_image_seed_offset").default(false), // Add +3 to first image seed
  steps: integer("steps").default(28),
  cfgScale: integer("cfg_scale").default(70), // Store as integer * 10 to preserve 1 decimal
  width: integer("width").default(832),
  height: integer("height").default(1216),
  scheduler: text("scheduler").default("Euler"),
  clipSkip: integer("clip_skip").default(2),
  quantity: integer("quantity").default(1), // Number of images to generate (1,2,4,8,12)
  loras: json("loras").$type<Array<{id: string; strength: number}>>(), // LoRA configurations
  
  // Image-to-Image / Image-to-Video specific fields
  generationType: text("generation_type").default("txt2img"), // txt2img | img2img | img2vid
  sourceImageUrl: text("source_image_url"), // Base image for img2img / img2vid
  sourceSharedImageId: varchar("source_shared_image_id"), // Track which shared image was enhanced (no FK to avoid circular dependency)
  denoiseStrength: integer("denoise_strength").default(75), // Store as int*100 for precision (0.75 -> 75)
  // Video output fields (img2vid)
  videoUrl: text("video_url"),
  videoThumbnailUrl: text("video_thumbnail_url"),
  videoDurationSeconds: integer("video_duration_seconds"),
  videoFps: integer("video_fps"),
  videoModelEngine: text("video_model_engine"), // e.g. "haiper", "kling", "wan", "minimax"
  status: text("status").default("pending"), // pending, processing, completed, failed
  jobId: text("job_id"),
  imageUrl: text("image_url"),
  blobKey: text("blob_key"),
  cost: integer("cost").default(5),
  metadata: json("metadata"),
  // File storage fields for structured naming
  characterName: text("character_name"), // Character name for file naming
  sceneName: text("scene_name"), // Scene name for file naming  
  storedImagePath: text("stored_image_path"), // Path to stored image in object storage
  storedMetadataPath: text("stored_metadata_path"), // Path to JSON metadata file in object storage
  batchId: varchar("batch_id"), // Links child images to parent batch generation
  originalGenerationData: json("original_generation_data").$type<{
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
    // Image-to-Image parameters
    generationType?: string;
    sourceImageUrl?: string;
    denoiseStrength?: number;
    civitaiJobData?: any; // Original CivitAI request data
  }>(), // Complete generation parameters for regeneration
  // Moderation fields
  moderationStatus: text("moderation_status").default("approved"), // pending, approved, rejected, flagged
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationReason: text("moderation_reason"), // Reason for rejection/flagging
  isHidden: boolean("is_hidden").default(false), // Hide from public view
  reportCount: integer("report_count").default(0), // Number of user reports
  contentRating: text("content_rating").default("unrated"), // unrated, pg, r - for splash page classification
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  // Passive latency tracking — populated by the BatchPoller on completion/failure.
  // Used by the admin model-performance leaderboard.
  queueMs: integer("queue_ms"),      // ms from submission to CivitAI picking up the job
  generateMs: integer("generate_ms"), // ms from job start to completion
}, (table) => [
  index("idx_generations_user_id").on(table.userId),
  index("idx_generations_status").on(table.status),
  index("idx_generations_created_at").on(table.createdAt),
  index("idx_generations_user_created").on(table.userId, table.createdAt),
]);

// Enhanced images via Replicate API
export const enhancedImages = pgTable("enhanced_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  originalGenerationId: varchar("original_generation_id").references(() => generations.id).notNull(),
  enhancedImageUrl: text("enhanced_image_url"),
  storedEnhancedPath: text("stored_enhanced_path"), // Path to enhanced image in object storage
  scaleFactor: integer("scale_factor").default(2), // 2x or 4x upscaling
  enhancementModel: text("enhancement_model").default("realesrgan"), // realesrgan or gfpgan
  faceEnhancement: boolean("face_enhancement").default(false), // Enable GFPGAN face enhancement (legacy field)
  replicateJobId: text("replicate_job_id"),
  status: text("status").default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  processingTime: integer("processing_time"), // Time in milliseconds
  cost: integer("cost").default(0), // Cost in credits
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_enhanced_images_user_id").on(table.userId),
  index("idx_enhanced_images_original_id").on(table.originalGenerationId),
  index("idx_enhanced_images_status").on(table.status),
]);

// User follows
export const follows = pgTable("follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").references(() => users.id).notNull(),
  followingId: varchar("following_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Model likes/favorites
export const modelLikes = pgTable("model_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  modelId: varchar("model_id").references(() => models.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_model_likes_user_id").on(table.userId),
  index("idx_model_likes_model_id").on(table.modelId),
  index("idx_model_likes_user_model").on(table.userId, table.modelId),
]);

// Model reviews and ratings
export const modelReviews = pgTable("model_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  modelId: varchar("model_id").references(() => models.id).notNull(),
  rating: integer("rating").notNull(), // 1-5 stars
  title: text("title"),
  content: text("content"),
  images: json("images").$type<string[]>(), // Review images
  helpful: integer("helpful").default(0), // Helpful votes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Collections
export const collections = pgTable("collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  isPublic: boolean("is_public").default(true),
  modelCount: integer("model_count").default(0),
  followers: integer("followers").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Collection items
export const collectionItems = pgTable("collection_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").references(() => collections.id).notNull(),
  modelId: varchar("model_id").references(() => models.id).notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});

// Comments on models
export const modelComments = pgTable("model_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  modelId: varchar("model_id").references(() => models.id).notNull(),
  parentId: varchar("parent_id").references((): any => modelComments.id), // For nested comments
  content: text("content").notNull(),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User-generated articles and guides
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  coverImage: text("cover_image"),
  tags: json("tags").$type<string[]>(),
  category: text("category"), // tutorial, guide, news, showcase
  published: boolean("published").default(false),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // follow, like, comment, review, mention
  title: text("title").notNull(),
  message: text("message"),
  data: json("data"), // Additional context data
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_notifications_user_id").on(table.userId),
  index("idx_notifications_read").on(table.read),
  index("idx_notifications_user_read").on(table.userId, table.read),
  index("idx_notifications_created_at").on(table.createdAt),
]);

// Banned emails to prevent re-signup
export const bannedEmails = pgTable("banned_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  reason: text("reason"), // Why they were banned
  bannedBy: varchar("banned_by").references(() => users.id), // Admin who banned them
  bannedAt: timestamp("banned_at").defaultNow(),
});

// Image prompts and metadata shared by users
export const sharedImages = pgTable("shared_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  generationId: varchar("generation_id").references(() => generations.id),
  title: text("title"),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  seed: integer("seed"),
  loras: json("loras").$type<Array<{id: string; strength: number}>>(),
  modelUsed: text("model_used"),
  modelId: varchar("model_id"),
  imageUrl: text("image_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  tags: json("tags").$type<string[]>(),
  isNSFW: boolean("is_nsfw").default(false),
  likes: integer("likes").default(0),
  downloads: integer("downloads").default(0),
  views: integer("views").default(0),
  featured: boolean("featured").default(false),
  rating: text("rating").default("R"), // G, PG, PG-13, R, NC-17, X - content rating
  // Generation settings for enhancement/regeneration
  width: integer("width"),
  height: integer("height"),
  steps: integer("steps"),
  cfgScale: real("cfg_scale"),
  scheduler: text("scheduler"),
  clipSkip: integer("clip_skip"),
  // Moderation fields
  moderationStatus: text("moderation_status").default("pending"), // pending, approved, rejected, flagged
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationReason: text("moderation_reason"), // Reason for rejection/flagging
  reportCount: integer("report_count").default(0), // Number of user reports
  characterName: text("character_name"), // Character name from generation data
  sceneName: text("scene_name"), // Scene name from generation data
  storedImagePath: text("stored_image_path"), // Object-storage copy (was read by code but missing from schema)
  videoUrl: text("video_url"),               // For video generations shared to community
  videoThumbnailUrl: text("video_thumbnail_url"), // First frame of the video
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_shared_images_user_id").on(table.userId),
  index("idx_shared_images_created_at").on(table.createdAt),
  index("idx_shared_images_moderation_status").on(table.moderationStatus),
  index("idx_shared_images_character_name").on(table.characterName),
  index("idx_shared_images_scene_name").on(table.sceneName),
  index("idx_shared_images_user_created").on(table.userId, table.createdAt),
]);

export const favorites = pgTable("favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  generationId: varchar("generation_id").references(() => generations.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_favorites_user_id").on(table.userId),
  index("idx_favorites_generation_id").on(table.generationId),
  index("idx_favorites_user_generation").on(table.userId, table.generationId),
]);

export const userSharedImageLikes = pgTable("user_shared_image_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  sharedImageId: varchar("shared_image_id").references(() => sharedImages.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_shared_image_likes_user_id").on(table.userId),
  index("idx_user_shared_image_likes_shared_image_id").on(table.sharedImageId),
  index("idx_user_shared_image_likes_user_shared").on(table.userId, table.sharedImageId),
]);

export const characters = pgTable("characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  basePrompt: text("base_prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  imageUrl: text("image_url"), // Preview image for the character
  tags: json("tags").$type<string[]>(), // Tags for organizing characters
  isPublic: boolean("is_public").default(false), // Whether others can use this character
  isShared: boolean("is_shared").default(false), // Whether character is shared to public library
  category: text("category").default("User Characters/Female"), // Character category folder
  source: text("source").default("User").notNull(), // "CivitAI" or "User" to distinguish character libraries
  age: integer("age").default(20), // Character age (21-45 range) for prompts
  breastSize: integer("breast_size").default(2), // Breast size (1-5: Small, Medium, Large, XL, Huge)
  assSize: integer("ass_size").default(2), // Ass size (1-5: Small, Medium, Large, XL, Huge)
  // Generation settings
  baseModel: text("base_model"), // Model ID
  steps: integer("steps"),
  cfgScale: integer("cfg_scale"), // Store as integer * 10 to preserve 1 decimal
  seed: integer("seed"),
  width: integer("width"), // Image width
  height: integer("height"), // Image height
  scheduler: text("scheduler"), // Scheduler/sampler name
  clipSkip: integer("clip_skip"), // Clip skip value
  loras: json("loras").$type<Array<{ id: string; strength: number }>>().default([]), // LoRA configurations
  referenceGenerationId: varchar("reference_generation_id").references((): AnyPgColumn => generations.id), // Source generation for settings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_characters_user_id").on(table.userId),
  index("idx_characters_is_public").on(table.isPublic),
  index("idx_characters_is_shared").on(table.isShared),
  index("idx_characters_name").on(table.name),
]);

export const characterPresets = pgTable("character_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").references(() => characters.id).notNull(),
  generationId: varchar("generation_id").references(() => generations.id).notNull(),
  name: text("name"), // Optional name for the preset
  imageUrl: text("image_url"), // Preview image from the generation
  prompt: text("prompt"), // Full prompt used
  negativePrompt: text("negative_prompt"),
  modelId: text("model_id"), // Model ID
  steps: integer("steps"),
  cfgScale: integer("cfg_scale"), // Store as integer * 10
  seed: integer("seed"),
  width: integer("width"),
  height: integer("height"),
  scheduler: text("scheduler"),
  clipSkip: integer("clip_skip"),
  loras: json("loras").$type<Array<{ id: string; strength: number }>>().default([]),
  isDefault: boolean("is_default").default(false), // Whether this is the default preset
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const savedScenes = pgTable("saved_scenes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(), // Auto-generated title like "Beach & Water-Sandy Beach-Bikini-8-17-2025"
  description: text("description"), // Description of the scene
  prompt: text("prompt").notNull(), // The built prompt text
  locationCategory: text("location_category"), // For filtering
  location: text("location"), // Specific location for filtering
  outfitCategory: text("outfit_category"), // For filtering
  outfit: text("outfit"), // Specific outfit for filtering
  poseCategory: text("pose_category"), // For filtering
  pose: text("pose"), // Specific pose for filtering
  imageUrl: text("image_url"), // Preview image for the scene
  tags: json("tags").$type<string[]>(), // Tags for organizing scenes
  isFavorite: boolean("is_favorite").default(false), // Whether scene is favorited by user
  isShared: boolean("is_shared").default(false), // Whether scene is shared to public library
  sceneData: json("scene_data").$type<Record<string, string>>(), // All selected options for rebuilding
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_saved_scenes_user_id").on(table.userId),
  index("idx_saved_scenes_is_shared").on(table.isShared),
  index("idx_saved_scenes_is_favorite").on(table.isFavorite),
]);

export const savedPrompts = pgTable("saved_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(), // Auto-generated or custom name
  description: text("description"), // Short description of the prompt
  prompt: text("prompt").notNull(), // The full prompt text
  negativePrompt: text("negative_prompt"), // The negative prompt if any
  characterName: text("character_name"), // Character name if used
  sceneName: text("scene_name"), // Scene name if used
  imageUrl: text("image_url"), // Preview image for the prompt
  tags: json("tags").$type<string[]>(), // Tags for organizing prompts
  // Generation settings
  baseModel: text("base_model"), // Model ID
  steps: integer("steps"),
  cfgScale: integer("cfg_scale"), // Store as integer * 10 to preserve 1 decimal
  seed: integer("seed"),
  loras: json("loras").$type<Array<{ id: string; strength: number }>>().default([]), // LoRA configurations
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const qualityGroups = pgTable("quality_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  words: text("words").notNull(), // Comma-separated quality enhancement words
  isPublic: boolean("is_public").default(false), // Whether others can use this group
  createdAt: timestamp("created_at").defaultNow(),
});

export const sceneData = pgTable("scene_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(), // outfits, locations, poses
  subcategory: text("subcategory").notNull(), // The Mall & Retail, Home & Indoor Spaces, etc.
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Events for multi-step prompt building
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual steps within an event
export const eventSteps = pgTable("event_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  wordsToAdd: json("words_to_add").$type<string[]>().default([]), // Words/phrases to add to prompt
  wordsToRemove: json("words_to_remove").$type<string[]>().default([]), // Words/phrases to remove from prompt
  createdAt: timestamp("created_at").defaultNow(),
});

// User's favorite prompt words and phrases
export const favoritePromptWords = pgTable("favorite_prompt_words", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  word: text("word").notNull(),
  category: text("category"), // Optional category like "Quality", "Style", "Lighting", etc.
  usage_count: integer("usage_count").default(0), // Track how often it's used
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Signup promotions and bonuses
export const signupPromotions = pgTable("signup_promotions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Welcome Bonus", "Holiday Special"
  description: text("description"), // Promotion description
  buzzAmount: integer("buzz_amount").notNull().default(300), // Credits to award
  isActive: boolean("is_active").default(true), // Whether this promotion is currently active
  startDate: timestamp("start_date").defaultNow(), // When promotion starts
  endDate: timestamp("end_date"), // When promotion ends (null for indefinite)
  maxUses: integer("max_uses"), // Maximum number of uses (null for unlimited)
  currentUses: integer("current_uses").default(0), // How many times it's been used
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Track which users received which signup bonus
export const userSignupBonuses = pgTable("user_signup_bonuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  promotionId: varchar("promotion_id").references(() => signupPromotions.id).notNull(),
  buzzAwarded: integer("buzz_awarded").notNull(), // Amount actually awarded
  awardedAt: timestamp("awarded_at").defaultNow(),
});

// Credit purchase packages
export const creditPackages = pgTable("credit_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Starter Pack", "Pro Pack", "Mega Pack"
  description: text("description"), // Package description
  credits: integer("credits").notNull(), // Number of credits to award
  price: integer("price").notNull(), // Price in cents (USD)
  bonusCredits: integer("bonus_credits").default(0), // Extra credits for value packs
  isActive: boolean("is_active").default(true), // Whether package is available for purchase
  isPopular: boolean("is_popular").default(false), // Mark popular packages
  sortOrder: integer("sort_order").default(0), // Display order
  stripeProductId: text("stripe_product_id"), // Stripe product ID
  stripePriceId: text("stripe_price_id"), // Stripe price ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Credit purchase transactions
// Web push subscriptions (one row per browser/device)
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_push_subscriptions_user_id").on(table.userId),
]);
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  packageId: varchar("package_id").references(() => creditPackages.id),
  type: text("type").notNull(), // "purchase", "bonus", "refund", "admin_adjustment"
  amount: integer("amount").notNull(), // Credits added/removed (positive or negative)
  price: integer("price"), // Price paid in cents (for purchases)
  currency: text("currency").default("usd"), // Currency code
  status: text("status").default("pending"), // pending, completed, failed, refunded
  stripePaymentIntentId: text("stripe_payment_intent_id"), // Stripe payment intent ID
  stripeChargeId: text("stripe_charge_id"), // Stripe charge ID
  description: text("description"), // Transaction description
  metadata: json("metadata"), // Additional transaction data
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_credit_transactions_user_id").on(table.userId),
  index("idx_credit_transactions_status").on(table.status),
  index("idx_credit_transactions_created_at").on(table.createdAt),
  index("idx_credit_transactions_user_created").on(table.userId, table.createdAt),
]);

// Content reports - user reports for inappropriate content
export const contentReports = pgTable("content_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id").references(() => users.id).notNull(),
  contentType: text("content_type").notNull(), // "generation" or "shared_image"
  contentId: varchar("content_id").notNull(), // ID of the reported content
  reason: text("reason").notNull(), // inappropriate, spam, copyright, etc.
  description: text("description"), // Additional details from reporter
  status: text("status").default("pending"), // pending, resolved, dismissed
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  resolution: text("resolution"), // Action taken
  createdAt: timestamp("created_at").defaultNow(),
});

// Moderation actions log - track all moderation actions
export const moderationActions = pgTable("moderation_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moderatorId: varchar("moderator_id").references(() => users.id).notNull(),
  userId: varchar("user_id").references(() => users.id), // User who owned the content being moderated
  action: text("action").notNull(), // approve, reject, flag, hide, delete
  contentType: text("content_type").notNull(), // "generation", "shared_image", "user"
  contentId: varchar("content_id").notNull(), // ID of the moderated content
  reason: text("reason"), // Reason for the action
  previousStatus: text("previous_status"), // Previous moderation status
  newStatus: text("new_status"), // New moderation status
  metadata: json("metadata"), // Additional context data
  createdAt: timestamp("created_at").defaultNow(),
});

// Global platform settings
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // setting identifier
  value: text("value").notNull(), // setting value as string
  description: text("description"), // human readable description
  updatedBy: varchar("updated_by").references(() => users.id), // admin who last updated
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userFeedback = pgTable("user_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'error_report' | 'recommendation' | 'bug_report' | 'feature_request'
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: text("priority").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'urgent'
  adminResponse: text("admin_response"),
  respondedBy: varchar("responded_by").references(() => users.id),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
});

// Replit Auth user upsert schema
export const upsertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
});

export const insertModelSchema = createInsertSchema(models).pick({
  name: true,
  description: true,
  type: true,
  baseModel: true,
  rating: true,
  downloads: true,
  civitaiId: true,
  imageUrl: true,
  strengthMin: true,
  strengthMax: true,
  activationWords: true,
  modelVersion: true,
  arn: true,
  loraCategory: true,
  generationAllowed: true,
});

export const insertGenerationSchema = createInsertSchema(generations).pick({
  modelId: true,
  characterId: true,
  prompt: true,
  negativePrompt: true,
  seed: true,
  steps: true,
  cfgScale: true,
  width: true,
  height: true,
  scheduler: true,
  clipSkip: true,
  quantity: true,
  loras: true,
  characterName: true,
  sceneName: true,
  generationType: true,
  sourceImageUrl: true,
  denoiseStrength: true,
  useFirstImageSeedOffset: true,
}).extend({
  cfgScale: z.number().min(1).max(200).transform(val => Math.round(val * 10)), // Convert float to int * 10 (allow up to 20.0)
  quantity: z.number().int().min(1).max(12).optional().default(1), // Validate quantity
  loras: z.array(z.object({
    id: z.string(),
    strength: z.number().min(-2).max(2)
  })).max(10, "You can use up to 10 LoRAs at once").optional().default([]),
  characterName: z.string().optional(),
  sceneName: z.string().optional(),
  // Image-to-image / image-to-video validation
  generationType: z.enum(["txt2img", "img2img", "img2vid"]).default("txt2img"),
  sourceImageUrl: z.string().optional(),
  denoiseStrength: z.number().int().min(0).max(100).optional().default(75),
});

// Transform Studio request schema (img2img + img2vid)
export const transformRequestSchema = z.object({
  mode: z.enum(["img2img", "img2vid"]),
  sourceImageUrl: z.string().url(),
  // Durable storage path returned by /api/transform/upload-url; when present,
  // the server mints a fresh signed URL from this path instead of using the
  // potentially-expired sourceImageUrl for CivitAI orchestration.
  sourceImageObjectPath: z.string().optional(),
  prompt: z.string().min(1).max(2000),
  negativePrompt: z.string().max(2000).optional().default(""),
  // img2img params
  modelId: z.string().optional(),
  denoiseStrength: z.number().min(0).max(1).optional().default(0.5),
  steps: z.number().int().min(1).max(60).optional().default(28),
  cfgScale: z.number().min(1).max(20).optional().default(7),
  scheduler: z.string().optional().default("Euler"),
  width: z.number().int().min(256).max(1536).optional(),
  height: z.number().int().min(256).max(1536).optional(),
  seed: z.number().int().optional(),
  // img2img quality tier
  kleinVersion: z.enum(["4b", "9b"]).optional().default("4b"),
  // img2vid params
  videoEngine: z.enum(["wan-comfy-2.1", "wan-fal-2.2", "wan-fal-2.5", "kling-2.5", "vidu-q3", "ltx-2", "grok-img2vid"]).optional().default("wan-comfy-2.1"),
  durationSeconds: z.number().int().min(3).max(5).optional().default(5),
  fps: z.union([z.literal(16), z.literal(24)]).optional().default(16),
  motionStrength: z.number().min(0).max(10).optional().default(5),
});

export type TransformRequest = z.infer<typeof transformRequestSchema>;

export const insertEnhancedImageSchema = createInsertSchema(enhancedImages).pick({
  originalGenerationId: true,
  scaleFactor: true,
  enhancementModel: true,
  faceEnhancement: true,
}).extend({
  scaleFactor: z.number().int().refine(val => val === 2 || val === 4, {
    message: "Scale factor must be either 2 or 4"
  }).default(2),
  enhancementModel: z.enum(["realesrgan", "gfpgan"]).default("realesrgan"),
  faceEnhancement: z.boolean().default(false),
});

export const insertQualityGroupSchema = createInsertSchema(qualityGroups).pick({
  name: true,
  description: true,
  words: true,
  isPublic: true,
});

export const insertSceneDataSchema = createInsertSchema(sceneData).pick({
  category: true,
  subcategory: true,
  name: true,
  description: true,
});

export const insertSignupPromotionSchema = createInsertSchema(signupPromotions).pick({
  name: true,
  description: true,
  buzzAmount: true,
  isActive: true,
  startDate: true,
  endDate: true,
  maxUses: true,
});

export const insertUserSignupBonusSchema = createInsertSchema(userSignupBonuses).pick({
  userId: true,
  promotionId: true,
  buzzAwarded: true,
});

export const insertSavedSceneSchema = createInsertSchema(savedScenes).pick({
  title: true,
  description: true,
  prompt: true,
  tags: true,
  isFavorite: true,
  isShared: true,
  locationCategory: true,
  location: true,
  outfitCategory: true,
  outfit: true,
  poseCategory: true,
  pose: true,
  imageUrl: true,
  sceneData: true,
});

export const insertSavedPromptSchema = createInsertSchema(savedPrompts).pick({
  title: true,
  description: true,
  prompt: true,
  negativePrompt: true,
  characterName: true,
  sceneName: true,
  imageUrl: true,
  tags: true,
  baseModel: true,
  steps: true,
  cfgScale: true,
  seed: true,
  loras: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Generation = typeof generations.$inferSelect;
export type InsertGeneration = z.infer<typeof insertGenerationSchema>;
export type EnhancedImage = typeof enhancedImages.$inferSelect;
export type InsertEnhancedImage = z.infer<typeof insertEnhancedImageSchema>;
export type Character = typeof characters.$inferSelect;
export type QualityGroup = typeof qualityGroups.$inferSelect;
export type InsertQualityGroup = z.infer<typeof insertQualityGroupSchema>;
export type SceneData = typeof sceneData.$inferSelect;
export type InsertSceneData = z.infer<typeof insertSceneDataSchema>;
export type SavedScene = typeof savedScenes.$inferSelect;
export type InsertSavedScene = z.infer<typeof insertSavedSceneSchema>;
export type SavedPrompt = typeof savedPrompts.$inferSelect;
export type InsertSavedPrompt = z.infer<typeof insertSavedPromptSchema>;
export type Favorite = typeof favorites.$inferSelect;

export const insertFavoriteSchema = createInsertSchema(favorites).pick({
  generationId: true,
});

// Events schema
export const insertEventSchema = createInsertSchema(events).pick({
  title: true,
  description: true,
  isActive: true,
});

export const insertEventStepSchema = createInsertSchema(eventSteps).pick({
  eventId: true,
  stepNumber: true,
  title: true,
  description: true,
  wordsToAdd: true,
  wordsToRemove: true,
});

export const insertFavoritePromptWordSchema = createInsertSchema(favoritePromptWords).pick({
  word: true,
  category: true,
  usage_count: true,
});

export const insertCharacterSchema = createInsertSchema(characters).pick({
  name: true,
  description: true,
  basePrompt: true,
  negativePrompt: true,
  imageUrl: true,
  tags: true,
  isPublic: true,
  isShared: true,
  age: true,
  breastSize: true,
  assSize: true,
  baseModel: true,
  steps: true,
  cfgScale: true,
  seed: true,
  width: true,
  height: true,
  scheduler: true,
  clipSkip: true,
  loras: true,
  referenceGenerationId: true,
}).extend({
  age: z.number().int().min(18).max(45).optional().default(21), // Character age for prompts
  breastSize: z.number().int().min(1).max(5).optional().default(2),
  assSize: z.number().int().min(1).max(5).optional().default(2),
  cfgScale: z.number().min(1).max(200).optional(), // Keep as float for character storage
  steps: z.number().int().min(1).max(150).optional(),
  seed: z.number().int().optional(),
  width: z.number().int().min(256).max(2048).optional(),
  height: z.number().int().min(256).max(2048).optional(),
  scheduler: z.string().optional(),
  clipSkip: z.number().int().min(0).max(12).optional(),
  loras: z.array(z.object({
    id: z.string(),
    strength: z.number().min(-2).max(2)
  })).optional().default([]),
  referenceGenerationId: z.string().optional(),
});

export const insertCharacterPresetSchema = createInsertSchema(characterPresets).pick({
  characterId: true,
  generationId: true,
  name: true,
  imageUrl: true,
  prompt: true,
  negativePrompt: true,
  modelId: true,
  steps: true,
  cfgScale: true,
  seed: true,
  width: true,
  height: true,
  scheduler: true,
  clipSkip: true,
  loras: true,
  isDefault: true,
}).extend({
  cfgScale: z.number().min(1).max(200).optional(),
  steps: z.number().int().min(1).max(150).optional(),
  seed: z.number().int().optional(),
  width: z.number().int().min(256).max(2048).optional(),
  height: z.number().int().min(256).max(2048).optional(),
  clipSkip: z.number().int().min(0).max(12).optional(),
  loras: z.array(z.object({
    id: z.string(),
    strength: z.number().min(-2).max(2)
  })).optional().default([]),
  isDefault: z.boolean().optional().default(false),
});

export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

// Events types
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type EventStep = typeof eventSteps.$inferSelect;
export type InsertEventStep = z.infer<typeof insertEventStepSchema>;
export type FavoritePromptWord = typeof favoritePromptWords.$inferSelect;
export type InsertFavoritePromptWord = z.infer<typeof insertFavoritePromptWordSchema>;

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type CharacterPreset = typeof characterPresets.$inferSelect;
export type InsertCharacterPreset = z.infer<typeof insertCharacterPresetSchema>;

// Community types
export type Follow = typeof follows.$inferSelect;
export type ModelLike = typeof modelLikes.$inferSelect;
export type ModelReview = typeof modelReviews.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type ModelComment = typeof modelComments.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type BannedEmail = typeof bannedEmails.$inferSelect;
export type InsertBannedEmail = typeof bannedEmails.$inferInsert;
export type SharedImage = typeof sharedImages.$inferSelect;

// Community insert schemas
export const insertFollowSchema = createInsertSchema(follows).pick({
  followingId: true,
});

export const insertModelLikeSchema = createInsertSchema(modelLikes).pick({
  modelId: true,
});

export const insertModelReviewSchema = createInsertSchema(modelReviews).pick({
  modelId: true,
  rating: true,
  title: true,
  content: true,
  images: true,
}).extend({
  rating: z.number().int().min(1).max(5),
});

export const insertCollectionSchema = createInsertSchema(collections).pick({
  name: true,
  description: true,
  coverImage: true,
  isPublic: true,
});

export const insertCollectionItemSchema = createInsertSchema(collectionItems).pick({
  collectionId: true,
  modelId: true,
});

export const insertModelCommentSchema = createInsertSchema(modelComments).pick({
  modelId: true,
  parentId: true,
  content: true,
});

export const insertArticleSchema = createInsertSchema(articles).pick({
  title: true,
  content: true,
  excerpt: true,
  coverImage: true,
  tags: true,
  category: true,
  published: true,
});

export const insertSharedImageSchema = createInsertSchema(sharedImages).pick({
  generationId: true,
  title: true,
  prompt: true,
  negativePrompt: true,
  modelUsed: true,
  modelId: true,
  imageUrl: true,
  tags: true,
  isNSFW: true,
  rating: true,
  seed: true,
  loras: true,
  width: true,
  height: true,
  steps: true,
  cfgScale: true,
  scheduler: true,
  clipSkip: true,
  characterName: true,
  sceneName: true,
});

export const insertContentReportSchema = createInsertSchema(contentReports).pick({
  contentType: true,
  contentId: true,
  reason: true,
  description: true,
});

export const insertModerationActionSchema = createInsertSchema(moderationActions).pick({
  action: true,
  contentType: true,
  contentId: true,
  reason: true,
  previousStatus: true,
  newStatus: true,
  metadata: true,
});

export type InsertFollow = z.infer<typeof insertFollowSchema>;
export type InsertModelLike = z.infer<typeof insertModelLikeSchema>;
export type InsertModelReview = z.infer<typeof insertModelReviewSchema>;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type InsertCollectionItem = z.infer<typeof insertCollectionItemSchema>;
export type InsertModelComment = z.infer<typeof insertModelCommentSchema>;
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type InsertSharedImage = z.infer<typeof insertSharedImageSchema>;
export const insertCreditPackageSchema = createInsertSchema(creditPackages).pick({
  name: true,
  description: true,
  credits: true,
  price: true,
  bonusCredits: true,
  isActive: true,
  isPopular: true,
  sortOrder: true,
  stripeProductId: true,
  stripePriceId: true,
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).pick({
  packageId: true,
  type: true,
  amount: true,
  price: true,
  currency: true,
  status: true,
  stripePaymentIntentId: true,
  stripeChargeId: true,
  description: true,
  metadata: true,
});

export type SignupPromotion = typeof signupPromotions.$inferSelect;
export type InsertSignupPromotion = z.infer<typeof insertSignupPromotionSchema>;
export type UserSignupBonus = typeof userSignupBonuses.$inferSelect;
export type InsertUserSignupBonus = z.infer<typeof insertUserSignupBonusSchema>;
export type ContentReport = typeof contentReports.$inferSelect;
export type InsertContentReport = z.infer<typeof insertContentReportSchema>;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type InsertModerationAction = z.infer<typeof insertModerationActionSchema>;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

// Platform settings schemas
export const insertPlatformSettingSchema = createInsertSchema(platformSettings).pick({
  key: true,
  value: true,
  description: true,
});

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;

// User feedback schemas
export const insertUserFeedbackSchema = createInsertSchema(userFeedback).pick({
  type: true,
  title: true,
  description: true,
  priority: true,
});

export type UserFeedback = typeof userFeedback.$inferSelect;
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;

export type UserSharedImageLike = typeof userSharedImageLikes.$inferSelect;
export const insertUserSharedImageLikeSchema = createInsertSchema(userSharedImageLikes).pick({
  userId: true,
  sharedImageId: true,
});
export type InsertUserSharedImageLike = z.infer<typeof insertUserSharedImageLikeSchema>;

// Error logging table for troubleshooting
export const errorLogs = pgTable("error_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Optional - null for system errors
  sessionId: varchar("session_id"), // Session ID if available
  errorType: text("error_type").notNull(), // generation, api, authentication, database, etc.
  errorMessage: text("error_message").notNull(),
  errorCode: text("error_code"), // HTTP status code or custom error code
  route: text("route"), // API endpoint where error occurred
  method: text("method"), // HTTP method (GET, POST, etc.)
  userAgent: text("user_agent"), // Browser/client information
  ipAddress: text("ip_address"), // Client IP address
  requestData: json("request_data"), // Request parameters/body (sanitized)
  stackTrace: text("stack_trace"), // Error stack trace
  errorDetails: json("error_details"), // Additional error context
  resolved: boolean("resolved").default(false), // Admin can mark as resolved
  resolvedAt: timestamp("resolved_at"), // When error was resolved
  resolvedBy: varchar("resolved_by").references(() => users.id), // Admin who resolved
  notes: text("notes"), // Admin notes about the error
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_error_logs_type_date").on(table.errorType, table.createdAt),
  index("idx_error_logs_user").on(table.userId, table.createdAt),
  index("idx_error_logs_resolved").on(table.resolved, table.createdAt),
]);

export const insertErrorLogSchema = createInsertSchema(errorLogs).pick({
  userId: true,
  sessionId: true,
  errorType: true,
  errorMessage: true,
  errorCode: true,
  route: true,
  method: true,
  userAgent: true,
  ipAddress: true,
  requestData: true,
  stackTrace: true,
  errorDetails: true,
});

export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;

// User preferences table for storing fip-fap body preferences and other user choices
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  breastSize: integer("breast_size").notNull(), // 1-5 scale (Small to Huge)
  assSize: integer("ass_size").notNull(), // 1-5 scale (Small to Huge)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;

// System settings table for global app configuration
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // Setting key like 'maintenance_mode'
  value: text("value").notNull(), // Setting value as string
  description: text("description"), // Human readable description
  updatedBy: varchar("updated_by").references(() => users.id), // Admin who last updated
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings);
export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;

// User tracking tables for admin activity monitoring
export const trackingSessions = pgTable("tracking_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackedUserId: varchar("tracked_user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // User being tracked
  trackerAdminId: varchar("tracker_admin_id").notNull().references(() => users.id), // Admin doing the tracking
  startedAt: timestamp("started_at").notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at"), // Null while tracking is active
  isActive: boolean("is_active").default(true), // Quick check for active tracking
});

export const trackingEvents = pgTable("tracking_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => trackingSessions.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  page: text("page").notNull(), // Current page/route
  action: text("action").notNull(), // Action type: navigation, click, form_submit, etc.
  details: jsonb("details"), // Additional event details
});

export const insertTrackingSessionSchema = createInsertSchema(trackingSessions);
export type TrackingSession = typeof trackingSessions.$inferSelect;
export type InsertTrackingSession = z.infer<typeof insertTrackingSessionSchema>;

export const insertTrackingEventSchema = createInsertSchema(trackingEvents);
export type TrackingEvent = typeof trackingEvents.$inferSelect;
export type InsertTrackingEvent = z.infer<typeof insertTrackingEventSchema>;

// Prompt sanitization rules table for admin-managed content filtering
export const sanitizationRules = pgTable("sanitization_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleType: text("rule_type").notNull(), // 'positive_remove', 'positive_replace', 'negative_add', 'negative_block'
  pattern: text("pattern").notNull(), // Word or phrase to match
  replacement: text("replacement"), // Replacement text (for positive_replace rules)
  isEnabled: boolean("is_enabled").default(true),
  isSystemRule: boolean("is_system_rule").default(false), // System rules can't be deleted
  description: text("description"), // Admin notes about the rule
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_sanitization_rules_type").on(table.ruleType),
  index("idx_sanitization_rules_enabled").on(table.isEnabled),
]);

export const insertSanitizationRuleSchema = createInsertSchema(sanitizationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SanitizationRule = typeof sanitizationRules.$inferSelect;
export type InsertSanitizationRule = z.infer<typeof insertSanitizationRuleSchema>;

// API Keys table for external bot/service access
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  dailyLimit: integer("daily_limit").default(1200),
  dailyUsage: integer("daily_usage").default(0),
  lastResetDate: text("last_reset_date"),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_api_keys_user_id").on(table.userId),
  index("idx_api_keys_key_hash").on(table.keyHash),
  index("idx_api_keys_active").on(table.isActive),
]);

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
});
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

// Source image uploads — tracks images users upload for img2img / img2vid.
// Retained for 5 days then purged (object storage file + DB row).
export const sourceUploads = pgTable("source_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  objectPath: text("object_path").notNull(), // durable path in Replit Object Storage
  generationType: text("generation_type").notNull(), // 'img2img' | 'img2vid'
  generationId: varchar("generation_id"),              // linked generation (set after job starts)
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),        // uploadedAt + 5 days
}, (table) => [
  index("idx_source_uploads_user_id").on(table.userId),
  index("idx_source_uploads_expires_at").on(table.expiresAt),
]);

export const insertSourceUploadSchema = createInsertSchema(sourceUploads).omit({
  id: true,
  uploadedAt: true,
});
export type SourceUpload = typeof sourceUploads.$inferSelect;
export type InsertSourceUpload = z.infer<typeof insertSourceUploadSchema>;

// Per-user LoRA grouping assignments (synced across devices)
export const loraGroupings = pgTable("lora_groupings", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  // IDs the user has explicitly placed in the Character group
  charIds: json("char_ids").$type<string[]>().notNull().default([]),
  // IDs the user has explicitly moved to the Style group (overrides auto-detect)
  styleOverrideIds: json("style_override_ids").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LoraGrouping = typeof loraGroupings.$inferSelect;
export type InsertLoraGrouping = typeof loraGroupings.$inferInsert;
