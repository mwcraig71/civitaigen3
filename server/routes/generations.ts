import type { Express } from "express";
import { logger } from "../logger";
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

import { type RouteContext, eq, and, batchTracker, convertGenerationForResponse, convertGenerationsForResponse } from "./context";
import { generateImageWithProvider } from "./generation-pipeline";

export function registerGenerationsRoutes(app: Express, ctx: RouteContext) {
  // Get user generations with pagination
  app.get("/api/generations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub; // Get real authenticated user
      const limit = parseInt(req.query.limit as string) || 80; // Default 80 images per page
      const offset = parseInt(req.query.offset as string) || 0;
      const favoritesOnly = req.query.favoritesOnly === 'true';
      
      let allGenerations = await storage.getUserGenerations(userId);
      
      // If filtering by favorites only, get user's favorites and filter generations
      if (favoritesOnly) {
        const favorites = await storage.getUserFavorites(userId);
        const favoriteIds = new Set(favorites.map(f => f.generationId));
        allGenerations = allGenerations.filter(gen => favoriteIds.has(gen.id));
      }
      
      // Sort by newest first - pagination metadata is computed from filtered list
      const sortedGenerations = allGenerations
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      
      // Compute pagination from the filtered/sorted list (not the original unfiltered list)
      const totalFiltered = sortedGenerations.length;
      const paginatedGenerations = sortedGenerations.slice(offset, offset + limit);
      const hasMore = offset + limit < totalFiltered;
      
      res.json({
        generations: convertGenerationsForResponse(paginatedGenerations),
        hasMore,
        total: totalFiltered,
        offset,
        limit
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch generations" });
    }
  });

  // Get recent generations (for gallery) - authenticated users only see their own
  // Supports pagination with limit/offset for faster loading
  // OPTIMIZED: Uses database-level filtering and pagination instead of in-memory processing
  app.get("/api/generations/recent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const limit = parseInt(req.query.limit as string) || 24;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Use optimized database query with filtering, ordering, and pagination at database level
      const { generations, total, hasMore } = await storage.getPaginatedUserRecentGenerations(userId, limit, offset);
      
      res.json({
        generations: convertGenerationsForResponse(generations),
        hasMore,
        total,
        offset,
        limit
      });
    } catch (error) {
      logger.error("Error fetching user's recent generations:", error);
      res.status(500).json({ message: "Failed to fetch recent generations" });
    }
  });

  // Get processing generations for WebSocket reconnection recovery
  app.get("/api/generations/processing", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      
      // Get only processing generations for this user
      const generations = await storage.getUserGenerations(userId);
      const processingGenerations = generations.filter(gen => gen.status === "processing");
      
      logger.info(`📡 State recovery: Found ${processingGenerations.length} processing generations for user ${userId}`);
      res.json(convertGenerationsForResponse(processingGenerations));
    } catch (error) {
      logger.error("Error fetching processing generations:", error);
      res.status(500).json({ message: "Failed to fetch processing generations" });
    }
  });

  // Get user generations formatted for fip-fap browsing
  // OPTIMIZED: Uses database-level filtering and pagination (including character filter)
  app.get("/api/generations/for-fipfap", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const character = req.query.character as string;
      
      // Use optimized database query - handles status filtering, ordering, character filter, and pagination at DB level
      const { generations, total, hasMore } = await storage.getPaginatedUserRecentGenerations(
        userId,
        limit,
        offset,
        character || undefined // Pass character filter to database
      );
      
      // Convert to shared image format for compatibility with fip-fap
      const formattedGenerations = generations.map(gen => ({
        id: gen.id,
        imageUrl: `/api/images/${gen.id}`, // Use our image serving endpoint instead of blob URL
        // Pass video fields through so fip-fap can render the video player
        videoUrl: (gen as any).videoUrl || undefined,
        videoThumbnailUrl: (gen as any).videoThumbnailUrl || undefined,
        prompt: gen.prompt || '',
        negativePrompt: gen.negativePrompt || '',
        modelUsed: (gen as { modelName?: string | null }).modelName || gen.modelId || 'Unknown Model',
        characterName: gen.characterName,
        sceneName: gen.sceneName,
        width: gen.width,
        height: gen.height,
        steps: gen.steps,
        cfgScale: gen.cfgScale,
        seed: gen.seed,
        loras: gen.loras || [],
        likes: 0, // Not applicable for personal gallery
        downloads: 0,
        views: 0,
        isNSFW: false,
        createdAt: gen.createdAt,
        userId: userId
      }));
      
      res.json({
        images: formattedGenerations,
        hasMore,
        total,
        offset,
        limit
      });
    } catch (error) {
      logger.error("Error fetching user generations for fip-fap:", error);
      res.status(500).json({ message: "Failed to fetch user generations" });
    }
  });

  // Create new generation
  app.post("/api/generations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub; // Get real authenticated user
      
      // Get user's API key for CivitAI
      const userApiKey = await storage.getUserApiKey(userId);
      logger.info(`🚨 QUANTITY DEBUG: User requested ${req.body.quantity} images`);
      logger.info(`📝 Generation POST request received:`, JSON.stringify(req.body, null, 2));
      logger.info(`🔍 LoRAs in request body:`, req.body.loras?.length || 0, req.body.loras);
      logger.info(`🎲 Seed from frontend:`, req.body.seed, '(type:', typeof req.body.seed, ')');
      
      // If there are LoRAs, check if generation should proceed
      if (req.body.loras && req.body.loras.length > 0) {
        logger.info(`⚠️ DEBUGGING LoRA issue: Generation attempted with ${req.body.loras.length} LoRAs`);
        logger.info(`⚠️ LoRA IDs:`, req.body.loras.map((l: any) => l.id));
      }
      
      const validatedData = insertGenerationSchema.parse(req.body);
      
      // Validate that a model is selected
      if (!validatedData.modelId || validatedData.modelId.trim() === '') {
        return res.status(400).json({ message: "Please select a model before generating images" });
      }

      // Validate that every selected LoRA can actually be used BEFORE charging
      // credits or starting a background job. A LoRA "fails" when it's missing
      // from our model store or has no CivitAI ARN (common after a model refresh
      // or restart when stale LoRA IDs linger in the form). Previously these were
      // silently skipped in the background, so the user got a plain image with no
      // idea their LoRA never applied. Fail loudly instead — no credits are used.
      if (validatedData.loras && validatedData.loras.length > 0) {
        const failedLoras: string[] = [];
        for (const lora of validatedData.loras) {
          const loraModel = await storage.getModelById(lora.id);
          if (!loraModel || !loraModel.arn) {
            failedLoras.push(loraModel?.name || lora.id);
          }
        }
        if (failedLoras.length > 0) {
          const many = failedLoras.length > 1;
          return res.status(400).json({
            message: `LoRA failed to load: ${failedLoras.join(', ')}. Please remove ${many ? 'these LoRAs' : 'this LoRA'} and add ${many ? 'them' : 'it'} again. This can happen after models are refreshed — no credits were used.`,
            loraError: true,
            failedLoras,
          });
        }
      }
      
      // Apply age sanitization before sending to CivitAI
      const originalPrompt = validatedData.prompt;
      const originalNegativePrompt = validatedData.negativePrompt || '';
      
      validatedData.prompt = civitaiService.sanitizePromptAges(validatedData.prompt);
      validatedData.negativePrompt = civitaiService.sanitizeNegativePrompt(validatedData.negativePrompt || '');
      
      if (originalPrompt !== validatedData.prompt) {
        logger.info(`🔍 AGE DEBUG: Prompt sanitized from "${originalPrompt}" to "${validatedData.prompt}"`);
      }
      if (originalNegativePrompt !== validatedData.negativePrompt) {
        logger.info(`🔍 AGE DEBUG: Negative prompt sanitized from "${originalNegativePrompt}" to "${validatedData.negativePrompt}"`);
      }
      
      logger.info(`✅ Parsed generation data:`, JSON.stringify(validatedData, null, 2));
      logger.info(`🔍 LoRAs in validated data:`, validatedData.loras?.length || 0, validatedData.loras);
      logger.info(`🎯 QUANTITY DEBUG: Requested quantity = ${validatedData.quantity}`);
      
      // Check user credits with pricing based on API key usage
      const user = await storage.getUser(userId);
      const creditsPerImage = userApiKey ? 4 : 12; // 4 credits with own API key, 12 credits on platform
      const requiredCredits = (validatedData.quantity || 1) * creditsPerImage;
      
      logger.info(`💰 Credit calculation: ${validatedData.quantity || 1} images × ${creditsPerImage} credits each = ${requiredCredits} total credits ${userApiKey ? '(using your API key)' : '(using platform)'}`);
      if (!user || (user.buzzCredits || 0) < requiredCredits) {
        const pricingText = userApiKey ? " (4 credits per image with your API key)" : " (12 credits per image on platform)";
        
        // Special message for demo users who run out of credits
        if (userId === 'demo_user_fixed_id') {
          return res.status(400).json({ 
            message: `Demo credits exhausted! You've used all your demo credits. Sign up to get 300 free Buzz credits and continue creating!`,
            isDemoLimit: true
          });
        }
        
        return res.status(400).json({ message: `Insufficient Buzz credits. Need ${requiredCredits} credits for ${validatedData.quantity || 1} image(s)${pricingText}.` });
      }

      // Create generation record
      const generation = await storage.createGeneration({
        ...validatedData,
        userId,
      });
      logger.info(`💾 Generation record created: ${generation.id}`);

      // BATCH FIX: Initialize batch tracking for this generation (always, even for single images)
      batchTracker.set(generation.id, {
        totalImages: validatedData.quantity || 1,
        completedImages: 0,
        userId: userId,
        firstImageClaimed: false // Atomic flag to prevent race condition
      });
      logger.info(`🎯 BATCH TRACKER: Initialized batch ${generation.id} expecting ${validatedData.quantity || 1} images`);

      // Deduct credits and track platform API usage
      const newCredits = Math.max(0, (user.buzzCredits || 0) - requiredCredits); // Ensure no negative credits
      await storage.updateUserCredits(userId, newCredits);
      
      // Track platform API usage for users without their own API key
      if (!userApiKey) {
        const newPlatformCount = (user.platformGenerations || 0) + 1;
        await storage.updateUserPlatformGenerations(userId, newPlatformCount);
        logger.info(`📊 Platform API usage tracked: ${newPlatformCount} generations for user ${userId}`);
      }

      // Start image generation with configured provider
      logger.info(`🚀 Starting background image generation for ${generation.id}`);
      generateImageWithProvider(generation.id, userId, validatedData, userApiKey || undefined).catch(error => {
        logger.error("❌ Background generation failed:", error);
      });

      // Include platform generation count in response for popup logic
      const responseData = convertGenerationForResponse(generation);
      if (!userApiKey) {
        responseData.platformGenerations = (user.platformGenerations || 0);
      }

      res.json(responseData);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error("Validation error:", error.errors);
        logger.error("Request body:", req.body);
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Generation error:", error);
      res.status(500).json({ message: "Failed to create generation" });
    }
  });

}
