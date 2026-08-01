import type { Express } from "express";
import { logger } from "../logger";
import { learnFromLikedImage } from "../preference-learning";
import { requireAdmin } from "../middleware";
import { getVapidPublicKey, saveSubscription, removeSubscription, sendPushToUser, pushEnabled } from "../push";
import { randomUUID } from "crypto";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "../storage";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, parseObjectPath } from "../objectStorage";
import { civitaiService, CivitAIService } from "../civitai-service";
import { diffusService, DiffusService } from "../diffus-service";
import { recoveryService } from '../recovery-service';
import { GeminiService, type AIPromptRequest } from "../gemini-service";
import { generateSceneTitleAndDescription } from "../gemini";
import { ErrorLogger } from "../error-logger";
import { insertGenerationSchema, insertFavoriteSchema, insertModelLikeSchema, insertCharacterSchema, insertQualityGroupSchema, insertSavedSceneSchema, insertSavedPromptSchema, insertSignupPromotionSchema, insertCreditPackageSchema, insertCreditTransactionSchema, insertEventSchema, insertEventStepSchema, insertFavoritePromptWordSchema, transformRequestSchema, generations, models } from "@shared/schema";
import { civitaiOrchestration } from "../civitai-orchestration";
import { db } from "../db";
import type { User, Generation } from "@shared/schema";
import Stripe from "stripe";
import { ZodError, z } from "zod";
import { setupAuth, isAuthenticated } from "../googleAuth";
import multer from "multer";
import Replicate from "replicate";
import { responseCache, CACHE_TTL, createCacheKey } from "../cache";
import { getCleanupStats, runImageCleanup, RETENTION_POLICY } from "../image-cleanup-service";
import OpenAI from "openai";
import { apiV1Router, generateApiKey, hashApiKey, hashBotPassword, setGenerateImageHandler, setBatchTracker, setSubmitTransformHandler } from "../api-v1";

import { type RouteContext, eq, and, broadcastToUser, insertBulkShareImageSchema, insertBulkCharacterUpdateSchema } from "./context";

export function registerSharedImagesRoutes(app: Express, ctx: RouteContext) {
  const { objectStorageService } = ctx;
  // Shared Images (Community) endpoints with pagination
  app.get("/api/shared-images", async (req: any, res) => {
    try {
      const { search, tags, nsfw, featured, character, scene, limit, offset, promptOnly, randomStart, sort, promptSearch, ratingFilter, rating, excludeOwn, likedOnly } = req.query;
      const filters: any = {};
      
      if (search) filters.search = search as string;
      if (promptSearch) filters.promptSearch = promptSearch as string;
      if (tags) filters.tags = (tags as string).split(',');
      if (nsfw !== undefined) filters.isNSFW = nsfw === 'true';
      if (featured !== undefined) filters.featured = featured === 'true';
      if (character) filters.character = character as string;
      if (scene) filters.scene = scene as string;
      
      const limitNum = parseInt(limit as string) || 80; // Default 80 images per page
      let offsetNum = parseInt(offset as string) || 0;
      const sortBy = (sort as string) || 'newest';
      
      let allImages = await storage.getSharedImages(filters);
      
      // Filter by liked images only if requested
      if (likedOnly === 'true') {
        if (req.user) {
          const userId = (req.user as any).claims?.sub;
          if (userId) {
            const likedImageIds = await storage.getUserLikedImages(userId);
            const likedSet = new Set(likedImageIds);
            allImages = allImages.filter(img => 
              likedSet.has(img.id) || (img.generationId && likedSet.has(img.generationId))
            );
            logger.info(`💗 Liked filter applied for user ${userId}: ${allImages.length} results`);
          }
        } else {
          // Return empty array for unauthenticated users requesting liked images
          allImages = [];
          logger.info(`💗 Liked filter requested but no authenticated user - returning empty`);
        }
      }
      
      // Apply user-selected rating filter (from search)
      if (rating) {
        allImages = allImages.filter(img => img.rating === rating);
        logger.info(`🎯 Rating filter applied (${rating}): ${allImages.length} results`);
      }
      
      // Apply global rating filter (R/PG only) - controlled by admin setting
      const globalRatingFilterEnabled = await storage.getSystemSetting('rating_filter_enabled');
      if (globalRatingFilterEnabled?.value === 'true') {
        allImages = allImages.filter(img => 
          img.rating === 'R' || img.rating === 'PG'
        );
        logger.info(`🔒 Global rating filter applied (R/PG only): ${allImages.length} results`);
      }
      
      // Apply prompt-only filtering if requested (for community search)
      if (search && promptOnly === 'true') {
        const searchTerm = (search as string).toLowerCase();
        allImages = allImages.filter(img => 
          img.prompt.toLowerCase().includes(searchTerm)
        );
      }
      
      // Exclude own images if requested (for "not my images" filter)
      if (excludeOwn === 'true' && (req as any).user) {
        const userId = ((req as any).user as any).claims?.sub;
        if (userId) {
          allImages = allImages.filter(img => img.userId !== userId);
          logger.info(`🚫 Excluding own images for user ${userId}: ${allImages.length} results`);
        }
      }
      
      // Apply search filter for specific prompt search (from FipFap search)
      if (promptSearch) {
        const searchTerm = (promptSearch as string).toLowerCase();
        allImages = allImages.filter(img => 
          img.prompt && img.prompt.toLowerCase().includes(searchTerm)
        );
        logger.info(`🔍 Applied prompt search filter: "${promptSearch}" => ${allImages.length} results`);
      }
      
      // Apply sorting based on sort parameter
      let sortedImages: typeof allImages;
      switch (sortBy) {
        case 'oldest':
          sortedImages = allImages.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
          break;
        case 'likes':
          sortedImages = allImages.sort((a, b) => (b.likes || 0) - (a.likes || 0));
          break;
        case 'views':
          sortedImages = allImages.sort((a, b) => (b.views || 0) - (a.views || 0));
          break;
        case 'prompt_az':
          sortedImages = allImages.sort((a, b) => {
            const promptA = (a.prompt || '').toLowerCase();
            const promptB = (b.prompt || '').toLowerCase();
            return promptA.localeCompare(promptB) || new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
          });
          break;
        case 'prompt_za':
          sortedImages = allImages.sort((a, b) => {
            const promptA = (a.prompt || '').toLowerCase();
            const promptB = (b.prompt || '').toLowerCase();
            return promptB.localeCompare(promptA) || new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
          });
          break;
        case 'trending': {
          // Hacker News-style gravity: engagement / (age + 2h)^1.5.
          // Remixes are the strongest signal (someone spent credits on it).
          const now = Date.now();
          const score = (img: any) => {
            const likes = img.likes || 0;
            const remixes = img.remixCount || 0;
            const views = img.views || 0;
            const ageHours = Math.max(0, (now - new Date(img.createdAt!).getTime()) / 3_600_000);
            return (likes + remixes * 2 + views * 0.05 + 1) / Math.pow(ageHours + 2, 1.5);
          };
          sortedImages = allImages.sort((a, b) => score(b) - score(a));
          break;
        }
        default: // 'newest'
          sortedImages = allImages.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
          break;
      }
      
      // Handle random start - compute random offset if requested
      if (randomStart === 'true') {
        const maxValidOffset = Math.max(0, sortedImages.length - limitNum);
        offsetNum = Math.floor(Math.random() * (maxValidOffset + 1));
        logger.info(`🎲 Random start requested: Generated offset ${offsetNum} from ${sortedImages.length} total images (max valid: ${maxValidOffset})`);
      }
      
      const paginatedImages = sortedImages.slice(offsetNum, offsetNum + limitNum);
      const hasMore = offsetNum + limitNum < sortedImages.length;
      
      res.json({
        images: paginatedImages,
        hasMore,
        total: sortedImages.length,
        offset: offsetNum,
        limit: limitNum
      });
    } catch (error) {
      logger.error("Error fetching shared images:", error);
      res.status(500).json({ message: "Failed to fetch shared images" });
    }
  });

  // Get available scene names for filtering and autocomplete (cached)
  app.get("/api/shared-images/scenes", async (req, res) => {
    try {
      const cacheKey = '/api/shared-images/scenes';
      const clientETag = req.headers['if-none-match'];
      
      // Check cache with ETag support
      const cacheResult = responseCache.getWithETagCheck(cacheKey, clientETag);
      if (cacheResult.hit && cacheResult.notModified) {
        return res.status(304).end();
      }
      if (cacheResult.hit && cacheResult.data) {
        res.setHeader('ETag', cacheResult.etag!);
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.json(cacheResult.data);
      }
      
      const allImages = await storage.getSharedImages({});
      const scenes = new Set<string>();
      
      allImages.forEach(img => {
        if (img.sceneName) {
          const normalizedName = img.sceneName.trim();
          if (normalizedName) {
            scenes.add(normalizedName);
          }
        }
      });
      
      const sortedScenes = Array.from(scenes).sort((a, b) => a.localeCompare(b));
      
      // Cache for 1 minute
      const { etag } = responseCache.set(cacheKey, sortedScenes, CACHE_TTL.MEDIUM);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json(sortedScenes);
    } catch (error) {
      logger.error("Error fetching scene names:", error);
      res.status(500).json({ message: "Failed to fetch scene names" });
    }
  });

  // Get available character names for filtering (cached)
  app.get("/api/shared-images/characters", async (req, res) => {
    try {
      const cacheKey = '/api/shared-images/characters';
      const clientETag = req.headers['if-none-match'];
      
      // Check cache with ETag support
      const cacheResult = responseCache.getWithETagCheck(cacheKey, clientETag);
      if (cacheResult.hit && cacheResult.notModified) {
        return res.status(304).end();
      }
      if (cacheResult.hit && cacheResult.data) {
        res.setHeader('ETag', cacheResult.etag!);
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.json(cacheResult.data);
      }
      
      const allImages = await storage.getSharedImages({});
      const characters = new Set<string>();
      
      allImages.forEach(img => {
        if (img.characterName) {
          // Normalize character names: trim whitespace and collapse doubled strings
          let normalizedName = img.characterName.trim();
          
          // Guard against doubled strings (e.g., "SaraSara" -> "Sara")  
          if (normalizedName.length % 2 === 0 && normalizedName.length > 0) {
            const halfLength = normalizedName.length / 2;
            const firstHalf = normalizedName.substring(0, halfLength);
            const secondHalf = normalizedName.substring(halfLength);
            if (firstHalf === secondHalf) {
              normalizedName = firstHalf;
            }
          }
          
          if (normalizedName.length > 0) {
            characters.add(normalizedName);
          }
        }
      });
      
      const sortedCharacters = Array.from(characters).sort();
      
      // Cache for 1 minute
      const { etag } = responseCache.set(cacheKey, sortedCharacters, CACHE_TTL.MEDIUM);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json(sortedCharacters);
    } catch (error) {
      logger.error("Error fetching character names:", error);
      res.status(500).json({ message: "Failed to fetch character names" });
    }
  });

  // Get user's liked images (MUST be before :id route to avoid conflicts)
  app.get("/api/shared-images/liked", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const likedImageIds = await storage.getUserLikedImages(userId);
      res.json({ likedImages: likedImageIds });
    } catch (error) {
      logger.error("Error fetching user liked images:", error);
      res.status(500).json({ message: "Failed to fetch liked images" });
    }
  });

  app.get("/api/shared-images/:id", async (req, res) => {
    try {
      const image = await storage.getSharedImage(req.params.id);
      if (!image) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Increment view count
      await storage.incrementSharedImageViews(req.params.id);
      
      res.json(image);
    } catch (error) {
      logger.error("Error fetching shared image:", error);
      res.status(500).json({ message: "Failed to fetch shared image" });
    }
  });

  app.post("/api/shared-images", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Validate request body - only accept minimal required fields
      const { generationId, caption, tags, isNSFW, rating } = req.body;
      
      logger.info('📤 Share request received:', { generationId, rating, hasRating: !!rating });
      
      if (!generationId || typeof generationId !== 'string') {
        return res.status(400).json({ message: "generationId is required" });
      }
      
      // Validate rating if provided
      const validRatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'X'];
      if (rating && !validRatings.includes(rating)) {
        return res.status(400).json({ message: "Invalid rating. Must be one of: G, PG, PG-13, R, NC-17, X" });
      }
      
      // Fetch the generation and verify ownership
      const generation = await storage.getGeneration(generationId);
      if (!generation) {
        return res.status(404).json({ message: "Generation not found" });
      }
      
      if (generation.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to share this generation" });
      }
      
      if (generation.status !== 'completed' || (!generation.imageUrl && !(generation as any).videoUrl)) {
        return res.status(409).json({ message: "Generation must be completed to share" });
      }
      
      // Check for duplicate shares
      const existingShare = await storage.getSharedImageByGenerationId(generationId);
      if (existingShare) {
        return res.status(409).json({ message: "Generation already shared to community" });
      }
      
      // Determine video fields (video generations carry videoUrl + videoThumbnailUrl)
      const genAny = generation as any;
      const isVideo = !!(genAny.videoUrl);
      const videoUrl: string | null = genAny.videoUrl || null;
      const videoThumbnailUrl: string | null = genAny.videoThumbnailUrl || null;

      // For the community display image: prefer the video first-frame thumbnail,
      // then the stored source image, then the raw imageUrl.
      const displayImageUrl = (isVideo ? (videoThumbnailUrl || generation.imageUrl) : generation.imageUrl) || '';

      // Compute thumbnail URL if image is in object storage
      let thumbnailUrl: string | null = null;
      if (generation.storedImagePath) {
        thumbnailUrl = objectStorageService.getThumbnailPath(generation.storedImagePath);
      }
      // For videos without a stored image path, use videoThumbnailUrl as thumbnail too
      if (isVideo && !thumbnailUrl) {
        thumbnailUrl = videoThumbnailUrl;
      }

      // Server-side construction of share payload with all required fields
      const shareData = {
        generationId: generation.id,
        title: caption || `Generated with ${generation.characterName || 'AI'}`,
        prompt: generation.prompt || '', // Ensure non-null
        negativePrompt: generation.negativePrompt || '',
        modelUsed: (generation as { modelName?: string | null }).modelName || generation.modelId || 'Unknown Model',
        modelId: generation.modelId, // Include actual model ID for regeneration
        imageUrl: displayImageUrl,
        thumbnailUrl: thumbnailUrl,
        videoUrl: videoUrl,
        videoThumbnailUrl: videoThumbnailUrl,
        tags: tags || [],
        isNSFW: isNSFW || false,
        rating: rating || 'R', // Default to R if not provided
        characterName: generation.characterName,
        sceneName: generation.sceneName,
        // Additional generation details for community browsing and regeneration
        width: generation.width ?? undefined,
        height: generation.height ?? undefined,
        steps: generation.steps ?? undefined,
        cfgScale: generation.cfgScale ? generation.cfgScale / 10 : undefined, // Convert from integer*10 to real
        scheduler: generation.scheduler, // Include scheduler for regeneration
        clipSkip: generation.clipSkip, // Include clipSkip for regeneration
        seed: generation.seed ?? undefined,
        loras: generation.loras || [],
        userId: userId
      };
      
      const sharedImage = await storage.createSharedImage(shareData);
      
      // Award 6 buzz for sharing to community
      await storage.addBuzzToUser(userId, 6);
      const updatedUser = await storage.getUser(userId);
      logger.info(`💰 Awarded 6 buzz to user ${userId} for sharing image to community`);
      
      // Emit WebSocket event to notify the user
      broadcastToUser(userId, {
        type: 'buzz_awarded',
        amount: 6,
        reason: 'share',
        details: 'Thank you for sharing with the community!',
        newBalance: updatedUser?.buzzCredits || 0,
        imageId: sharedImage.id,
        actorId: userId
      });
      
      res.status(201).json(sharedImage);
    } catch (error) {
      logger.error("Error creating shared image:", error);
      res.status(500).json({ message: "Failed to create shared image" });
    }
  });

  app.delete("/api/shared-images/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const deleted = await storage.deleteSharedImage(req.params.id, userId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Shared image not found or not authorized" });
      }
      
      res.json({ message: "Shared image deleted successfully" });
    } catch (error) {
      logger.error("Error deleting shared image:", error);
      res.status(500).json({ message: "Failed to delete shared image" });
    }
  });

  app.patch("/api/shared-images/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { rating, characterName, sceneName } = req.body;
      
      // Fetch the shared image and verify ownership or admin status
      const sharedImage = await storage.getSharedImage(req.params.id);
      if (!sharedImage) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Check if user is admin
      const user = await storage.getUser(userId);
      const isAdmin = user?.isAdmin || false;
      
      // Only allow owner or admin to update
      if (sharedImage.userId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to update this shared image" });
      }
      
      // Validate rating if provided
      const validRatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'X'];
      if (rating && !validRatings.includes(rating)) {
        return res.status(400).json({ message: "Invalid rating. Must be one of: G, PG, PG-13, R, NC-17, X" });
      }
      
      // Build update data object with only provided fields
      const updateData: any = {};
      if (rating) updateData.rating = rating;
      if (characterName !== undefined) updateData.characterName = characterName;
      if (sceneName !== undefined) updateData.sceneName = sceneName;
      
      // Update the shared image
      const updated = await storage.updateSharedImage(req.params.id, updateData);
      
      if (!updated) {
        return res.status(500).json({ message: "Failed to update shared image" });
      }
      
      res.json({ message: "Shared image updated successfully", updated });
    } catch (error) {
      logger.error("Error updating shared image:", error);
      res.status(500).json({ message: "Failed to update shared image" });
    }
  });

  app.post("/api/shared-images/:id/like", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const isLiked = await storage.likeSharedImage(req.params.id, userId);

      // Learn from this like in the background: the liked image's prompt feeds
      // the liker's taste profile so AI Enhance reflects what they enjoy.
      if (isLiked) {
        (async () => {
          const img = await storage.getSharedImage(req.params.id);
          await learnFromLikedImage(userId, img?.prompt);
        })().catch((e) => logger.error('⚠️ Shared-image taste-learning failed:', e));
      }

      // Award 1 buzz to the image owner when someone likes their image (but not themselves)
      if (isLiked) {
        try {
          const sharedImage = await storage.getSharedImage(req.params.id);
          
          if (sharedImage && sharedImage.userId !== userId) {
            await storage.addBuzzToUser(sharedImage.userId, 1);
            const updatedUser = await storage.getUser(sharedImage.userId);
            logger.info(`💰 Awarded 1 buzz to user ${sharedImage.userId} for receiving a like`);
            
            // Emit WebSocket event to notify the image owner
            broadcastToUser(sharedImage.userId, {
              type: 'buzz_awarded',
              amount: 1,
              reason: 'like',
              details: 'Someone liked your image!',
              newBalance: updatedUser?.buzzCredits || 0,
              imageId: req.params.id,
              actorId: userId
            });
          }
        } catch (buzzError) {
          logger.error('Error in buzz award logic:', buzzError);
          // Don't let buzz errors break the like functionality
        }
      }
      
      res.json({ 
        message: isLiked ? "Image liked successfully" : "Image unliked successfully",
        isLiked 
      });
    } catch (error) {
      logger.error("Error toggling like on shared image:", error);
      res.status(500).json({ message: "Failed to toggle like on shared image" });
    }
  });

  app.post("/api/shared-images/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const image = await storage.getSharedImage(req.params.id);
      if (!image) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Increment download count
      await storage.incrementSharedImageDownloads(req.params.id);
      
      res.json({ 
        message: "Download tracked successfully",
        imageUrl: image.imageUrl 
      });
    } catch (error) {
      logger.error("Error tracking download:", error);
      res.status(500).json({ message: "Failed to track download" });
    }
  });

  app.delete("/api/shared-images/:id/report", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const imageId = req.params.id;
      
      // Check if image exists
      const image = await storage.getSharedImage(imageId);
      if (!image) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Mark image as reported/inappropriate and remove from public feed
      const deleted = await storage.reportSharedImage(imageId, userId);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to report image" });
      }
      
      res.json({ 
        message: "Image reported and removed successfully",
        reportedBy: userId,
        imageId 
      });
    } catch (error) {
      logger.error("Error reporting shared image:", error);
      res.status(500).json({ message: "Failed to report inappropriate content" });
    }
  });

  app.post("/api/shared-images/:id/view", async (req: any, res) => {
    try {
      const image = await storage.getSharedImage(req.params.id);
      if (!image) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Increment view count
      await storage.incrementSharedImageViews(req.params.id);
      
      res.json({ 
        message: "View tracked successfully"
      });
    } catch (error) {
      logger.error("Error tracking view:", error);
      res.status(500).json({ message: "Failed to track view" });
    }
  });

  // Update shared image character name (specific endpoint)
  app.put("/api/shared-images/:id/character", isAuthenticated, async (req: any, res) => {
    try {
      const imageId = req.params.id;
      const userId = (req.user as any).claims.sub;
      const { characterName } = req.body;
      
      // Get the shared image to verify ownership
      const sharedImage = await storage.getSharedImage(imageId);
      if (!sharedImage) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Only the image owner can update it
      if (sharedImage.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this shared image" });
      }
      
      // Sanitize and normalize character name
      let normalizedName = null;
      if (characterName && typeof characterName === 'string') {
        const trimmed = characterName.trim();
        if (trimmed.length > 0 && trimmed.length <= 100) {
          // Guard against doubled strings (e.g., "SaraSara" -> "Sara")
          if (trimmed.length % 2 === 0) {
            const halfLength = trimmed.length / 2;
            const firstHalf = trimmed.substring(0, halfLength);
            const secondHalf = trimmed.substring(halfLength);
            if (firstHalf === secondHalf) {
              logger.info(`🔧 Detected doubled character name "${trimmed}", collapsing to "${firstHalf}"`);
              normalizedName = firstHalf;
            } else {
              normalizedName = trimmed;
            }
          } else {
            normalizedName = trimmed;
          }
        }
      }
      
      // Update the shared image
      const updatedImage = await storage.updateSharedImage(imageId, { 
        characterName: normalizedName
      });
      
      if (!updatedImage) {
        return res.status(404).json({ message: "Failed to update shared image" });
      }
      
      logger.info(`✅ Updated character name for image ${imageId}: "${characterName}" -> "${normalizedName}"`);
      res.json(updatedImage);
    } catch (error) {
      logger.error("Error updating shared image character:", error);
      res.status(500).json({ message: "Failed to update shared image character" });
    }
  });

  // Update shared image details (character name and scene description)
  app.put("/api/shared-images/:id/details", isAuthenticated, async (req: any, res) => {
    try {
      const imageId = req.params.id;
      const userId = (req.user as any).claims.sub;
      const { characterName, sceneName } = req.body;
      
      // Get the shared image to verify ownership
      const sharedImage = await storage.getSharedImage(imageId);
      if (!sharedImage) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Only the image owner can update it
      if (sharedImage.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this shared image" });
      }
      
      // Normalize character name
      let normalizedCharacterName = null;
      if (characterName) {
        const trimmed = characterName.trim();
        if (trimmed.toLowerCase() !== 'none') {
          // Remove common suffixes like "(copy)" or " (copy)"
          if (trimmed.match(/\s*\(copy\)\s*$/i)) {
            normalizedCharacterName = trimmed.replace(/\s*\(copy\)\s*$/i, '').trim();
          } else if (trimmed.includes('(copy)')) {
            const firstHalf = trimmed.split('(copy)')[0].trim();
            if (firstHalf && firstHalf.length > 0) {
              normalizedCharacterName = firstHalf;
            } else {
              normalizedCharacterName = trimmed;
            }
          } else {
            normalizedCharacterName = trimmed;
          }
        }
      }
      
      // Normalize scene name
      const normalizedSceneName = sceneName?.trim() || null;
      
      // Update the shared image
      const updatedImage = await storage.updateSharedImage(imageId, { 
        characterName: normalizedCharacterName,
        sceneName: normalizedSceneName
      });
      
      if (!updatedImage) {
        return res.status(404).json({ message: "Failed to update shared image" });
      }
      
      logger.info(`✅ Updated image details for ${imageId}: character="${normalizedCharacterName}", scene="${normalizedSceneName}"`);
      res.json(updatedImage);
    } catch (error) {
      logger.error("Error updating shared image details:", error);
      res.status(500).json({ message: "Failed to update shared image details" });
    }
  });

  // Update shared image (character name) - Legacy endpoint
  app.put("/api/shared-images/:id", isAuthenticated, async (req: any, res) => {
    try {
      const imageId = req.params.id;
      const userId = (req.user as any).claims.sub;
      const { characterName } = req.body;
      
      // Get the shared image to verify ownership
      const sharedImage = await storage.getSharedImage(imageId);
      if (!sharedImage) {
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Only the image owner can update it
      if (sharedImage.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this shared image" });
      }
      
      // Update the shared image
      const updatedImage = await storage.updateSharedImage(imageId, { 
        characterName: characterName || null
      });
      
      if (!updatedImage) {
        return res.status(404).json({ message: "Failed to update shared image" });
      }
      
      res.json(updatedImage);
    } catch (error) {
      logger.error("Error updating shared image:", error);
      res.status(500).json({ message: "Failed to update shared image" });
    }
  });

  // Serve shared image from object storage
  app.get("/api/shared-images/:id/image", async (req, res) => {
    let sharedImage: Awaited<ReturnType<typeof storage.getSharedImage>> | undefined;
    try {
      const { id } = req.params;

      // Get shared image to find stored image path
      sharedImage = await storage.getSharedImage(id);
      logger.info("🖼️ Serving shared image:", id, "storedImagePath:", sharedImage?.storedImagePath);
      
      if (!sharedImage) {
        logger.error(`❌ Shared image not found: ${id}`);
        return res.status(404).json({ message: "Shared image not found" });
      }
      
      // Add CORS headers for production compatibility
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      
      // If no stored image path, try to get it from the original generation
      let storedImagePath = sharedImage.storedImagePath;
      if (!storedImagePath && sharedImage.generationId) {
        logger.info("⚠️ No storedImagePath on shared image, checking original generation:", sharedImage.generationId);
        const originalGeneration = await storage.getGeneration(sharedImage.generationId);
        if (originalGeneration?.storedImagePath) {
          storedImagePath = originalGeneration.storedImagePath;
          logger.info("✅ Found storedImagePath from original generation:", storedImagePath);
        }
      }
      
      // If still no stored image path, apply on-the-fly watermark
      if (!storedImagePath) {
        logger.info("⚠️ No storedImagePath found, applying on-the-fly watermark for shared image:", sharedImage.imageUrl);
        if (sharedImage.imageUrl) {
          try {
            // Get user's watermark preference (shared images get watermarks by default)
            const user = sharedImage.userId ? await storage.getUser(sharedImage.userId) : null;
            const showWatermark = user?.showWatermark !== false;
            
            // Fetch the CDN image
            const cdnResponse = await fetch(sharedImage.imageUrl);
            if (!cdnResponse.ok) {
              logger.error(`❌ Failed to fetch shared image CDN: ${cdnResponse.statusText}`);
              return res.redirect(sharedImage.imageUrl); // Fallback to direct redirect
            }
            
            const imageBuffer = Buffer.from(await cdnResponse.arrayBuffer());
            
            // Apply watermark if enabled
            if (showWatermark) {
              const sharp = (await import('sharp')).default;
              const metadata = await sharp(imageBuffer).metadata();
              const width = metadata.width ?? 512;
              const height = metadata.height ?? 512;
              const fontSize = Math.max(20, Math.floor(width / 28));
              const padding = Math.floor(fontSize * 1.2);
              
              const watermarkSvg = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                  <text 
                    x="${width - padding}" 
                    y="${height - padding}" 
                    font-family="Arial, Helvetica, sans-serif" 
                    font-size="${fontSize}" 
                    font-weight="bold" 
                    fill="white" 
                    fill-opacity="0.85"
                    stroke="black" 
                    stroke-width="2" 
                    stroke-opacity="0.6"
                    text-anchor="end">CiviVerse.com</text>
                </svg>
              `;
              
              const watermarkedBuffer = await sharp(imageBuffer)
                .composite([{ input: Buffer.from(watermarkSvg), top: 0, left: 0 }])
                .jpeg({ quality: 95 })
                .toBuffer();
              
              logger.info(`✨ Applied on-the-fly watermark to shared image (${width}x${height})`);
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.send(watermarkedBuffer);
            } else {
              // No watermark, just serve the image
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.send(imageBuffer);
            }
          } catch (watermarkError) {
            logger.error('❌ On-the-fly shared image watermark failed:', watermarkError);
            return res.redirect(sharedImage.imageUrl);
          }
        }
        logger.error(`❌ No image available for shared image: ${id}`);
        return res.status(404).json({ message: "Image not available" });
      }

      // Parse the stored image path to get bucket and object info  
      const pathParts = storedImagePath.startsWith('/') 
        ? storedImagePath.split('/') 
        : `/${storedImagePath}`.split('/');
      const bucketName = pathParts[1];
      const objectName = pathParts.slice(2).join('/');
      
      logger.info("🗂️ Parsed shared image path - bucket:", bucketName, "object:", objectName);
      
      // Get file from object storage and stream to response
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        logger.error(`❌ Shared image file not found in storage: ${bucketName}/${objectName}`);
        // Fallback to imageUrl if available
        if (sharedImage.imageUrl) {
          logger.info(`🔄 Fallback to imageUrl: ${sharedImage.imageUrl}`);
          return res.redirect(sharedImage.imageUrl);
        }
        return res.status(404).json({ message: "Image file not found in storage" });
      }

      // Get metadata for proper content type
      const [metadata] = await file.getMetadata();
      
      // Set proper headers for image serving with CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Get user's watermark preference (default to true)
      const user = sharedImage.userId ? await storage.getUser(sharedImage.userId) : null;
      const showWatermark = user?.showWatermark !== false;
      
      if (showWatermark) {
        // Download image to buffer and apply watermark
        const chunks: Buffer[] = [];
        const stream = file.createReadStream();
        
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        const imageBuffer = Buffer.concat(chunks);
        
        const sharp = (await import('sharp')).default;
        const sharpMetadata = await sharp(imageBuffer).metadata();
        const width = sharpMetadata.width ?? 512;
        const height = sharpMetadata.height ?? 512;
        const fontSize = Math.max(20, Math.floor(width / 28));
        const padding = Math.floor(fontSize * 1.2);
        
        const watermarkSvg = `
          <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <text 
              x="${width - padding}" 
              y="${height - padding}" 
              font-family="Arial, Helvetica, sans-serif" 
              font-size="${fontSize}" 
              font-weight="bold" 
              fill="white" 
              fill-opacity="0.85"
              stroke="black" 
              stroke-width="2" 
              stroke-opacity="0.6"
              text-anchor="end">CiviVerse.com</text>
          </svg>
        `;
        
        const watermarkedBuffer = await sharp(imageBuffer)
          .composite([{ input: Buffer.from(watermarkSvg), top: 0, left: 0 }])
          .jpeg({ quality: 95 })
          .toBuffer();
        
        logger.info(`✨ Applied watermark to stored shared image (${width}x${height}) for ID:`, id);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        return res.send(watermarkedBuffer);
      } else {
        // No watermark - stream directly for efficiency
        res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        const stream = file.createReadStream();
        
        const timeout = setTimeout(() => {
          logger.error('⏰ Shared image stream timeout for ID:', id);
          if (!res.headersSent) {
            res.status(504).json({ message: 'Image loading timeout' });
          }
        }, 30000);
        
        stream.pipe(res);
        
        stream.on('error', (error) => {
          clearTimeout(timeout);
          logger.error('❌ Stream error for shared image:', id, error);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming image' });
          }
        });
        
        stream.on('end', () => {
          clearTimeout(timeout);
          logger.info('✅ Shared image streamed successfully for ID:', id);
        });
      }
      
    } catch (error) {
      logger.error('❌ Error serving shared image:', error);
      // Enhanced error logging for debugging production issues
      logger.error('❌ Error details:', {
        sharedImageId: req.params.id,
        storedImagePath: sharedImage?.storedImagePath,
        imageUrl: sharedImage?.imageUrl,
        errorMessage: (error as Error).message,
        hasObjectStorage: !!process.env.PRIVATE_OBJECT_DIR
      });
      
      // Fallback to imageUrl if available
      if (sharedImage?.imageUrl && !res.headersSent) {
        logger.info(`🔄 Error fallback to imageUrl: ${sharedImage.imageUrl}`);
        return res.redirect(sharedImage.imageUrl);
      }
      
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to serve shared image' });
      }
    }
  });


  app.post("/api/shared-images/bulk-share", isAuthenticated, async (req: any, res) => {
    const result = insertBulkShareImageSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: result.error.issues,
      });
    }

    try {
      const userId = (req.user as any).claims.sub;
      const { generationIds } = result.data;
      
      const sharedImages = [];
      
      for (const generationId of generationIds) {
        // Get the generation data
        const generation = await storage.getGeneration(generationId);
        if (!generation || generation.userId !== userId) {
          continue; // Skip if generation not found or not owned by user
        }
        
        // Check if already shared
        const existingShared = await storage.getSharedImageByGenerationId(generationId);
        if (existingShared) {
          continue; // Skip if already shared
        }
        
        // Create shared image from generation with all settings
        const sharedImageData = {
          generationId: generation.id,
          title: `Generated Image - ${generation.prompt.slice(0, 30)}...`,
          prompt: generation.prompt,
          negativePrompt: generation.negativePrompt,
          modelUsed: (generation as { modelName?: string | null }).modelName || generation.modelId || 'Unknown Model',
          modelId: generation.modelId,
          imageUrl: generation.imageUrl!,
          tags: [],
          isNSFW: false,
          rating: 'R',
          characterName: generation.characterName || null,
          sceneName: generation.sceneName || null,
          width: generation.width ?? undefined,
          height: generation.height ?? undefined,
          steps: generation.steps ?? undefined,
          cfgScale: generation.cfgScale ?? undefined,
          seed: generation.seed ?? undefined,
          scheduler: generation.scheduler,
          clipSkip: generation.clipSkip ?? undefined,
          loras: generation.loras || [],
        };
        
        const sharedImage = await storage.createSharedImage({ ...sharedImageData, userId });
        sharedImages.push(sharedImage);
        
        // Award 6 buzz for sharing to community
        await storage.addBuzzToUser(userId, 6);
        const updatedUser = await storage.getUser(userId);
        logger.info(`💰 Awarded 6 buzz to user ${userId} for sharing image to community`);
        
        // Emit WebSocket event to notify the user
        broadcastToUser(userId, {
          type: 'buzz_awarded',
          amount: 6,
          reason: 'share',
          details: 'Thank you for sharing with the community!',
          newBalance: updatedUser?.buzzCredits || 0,
          imageId: sharedImage.id,
          actorId: userId
        });
      }
      
      res.json({
        message: `${sharedImages.length} images shared to community successfully`,
        sharedImages,
        buzzAwarded: sharedImages.length * 6
      });
    } catch (error) {
      logger.error("Error sharing images:", error);
      res.status(500).json({ message: "Failed to share images to community" });
    }
  });

  // Bulk update character names for generations
  app.post("/api/generations/bulk-update-character", isAuthenticated, async (req: any, res) => {
    const result = insertBulkCharacterUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: result.error.issues,
      });
    }

    try {
      const userId = (req.user as any).claims.sub;
      const { generationIds, characterName, characterId } = result.data;
      
      // Normalize character name: trim whitespace and handle doubled strings
      let normalizedName = characterName.trim();
      if (normalizedName.length % 2 === 0 && normalizedName.length > 0) {
        const halfLength = normalizedName.length / 2;
        const firstHalf = normalizedName.substring(0, halfLength);
        const secondHalf = normalizedName.substring(halfLength);
        if (firstHalf === secondHalf) {
          normalizedName = firstHalf;
        }
      }
      
      const updatedGenerations = [];
      const failedUpdates = [];
      
      for (const generationId of generationIds) {
        try {
          // Get the generation to verify ownership
          const generation = await storage.getGeneration(generationId);
          if (!generation || generation.userId !== userId) {
            failedUpdates.push({ generationId, reason: "Not found or not authorized" });
            continue;
          }
          
          // Update the generation's character information
          const updateData: any = { characterName: normalizedName };
          if (characterId) {
            updateData.characterId = characterId;
          }
          
          await storage.updateGeneration(generationId, updateData);
          
          // Also update the corresponding shared image if it exists
          const sharedImage = await storage.getSharedImageByGenerationId(generationId);
          if (sharedImage) {
            await storage.updateSharedImage(sharedImage.id, { characterName: normalizedName });
          }
          
          updatedGenerations.push({
            generationId,
            characterName: normalizedName,
            characterId: characterId || null
          });
        } catch (error) {
          logger.error(`Error updating generation ${generationId}:`, error);
          failedUpdates.push({ generationId, reason: "Update failed" });
        }
      }
      
      logger.info(`✅ Bulk updated character name for ${updatedGenerations.length} generations: "${characterName}" -> "${normalizedName}"`);
      
      res.json({
        message: `Updated ${updatedGenerations.length} generation(s) successfully`,
        updated: updatedGenerations,
        failed: failedUpdates,
        total: generationIds.length
      });
    } catch (error) {
      logger.error("Error bulk updating character names:", error);
      res.status(500).json({ message: "Failed to bulk update character names" });
    }
  });

}
