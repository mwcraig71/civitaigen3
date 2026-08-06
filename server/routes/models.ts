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

import { type RouteContext, eq, and } from "./context";

export function registerModelsRoutes(app: Express, ctx: RouteContext) {
  // Get all models (load from CivitAI if empty) - cached for performance
  app.get("/api/models", async (req, res) => {
    try {
      const cacheKey = '/api/models';
      const clientETag = req.headers['if-none-match'];
      
      // Check cache with ETag support
      const cacheResult = responseCache.getWithETagCheck(cacheKey, clientETag);
      if (cacheResult.hit && cacheResult.notModified) {
        return res.status(304).end();
      }
      if (cacheResult.hit && cacheResult.data) {
        res.setHeader('ETag', cacheResult.etag!);
        res.setHeader('Cache-Control', 'no-cache');
        return res.json(cacheResult.data);
      }
      
      let models = await storage.getAllModels();
      
      // If no models in storage, fetch from CivitAI
      if (models.length === 0) {
        logger.info("No models in storage, fetching from CivitAI...");
        const civitaiModels = await civitaiService.fetchAndConvertModels(4, 1, 'Highest Rated', 'AllTime'); // Fetch 4 pages (200 models)
        
        // Store fetched models
        for (const model of civitaiModels) {
          await storage.createModel({
            name: model.name,
            description: model.description,
            type: model.type,
            baseModel: model.baseModel,
            rating: model.rating,
            downloads: model.downloads,
            civitaiId: model.civitaiId,
            modelVersion: model.modelVersion,
            arn: model.arn,
            imageUrl: model.imageUrl,
            strengthMin: model.strengthMin,
            strengthMax: model.strengthMax,
            activationWords: model.activationWords,
          });
        }
        
        models = await storage.getAllModels();
      }
      
      // Server-side cache for 12 hours (models rarely change), but tell the
      // browser to always revalidate so a fresh download is immediately
      // searchable without waiting 12h for the browser HTTP cache to expire.
      const { etag } = responseCache.set(cacheKey, models, CACHE_TTL.MODELS);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      res.json(models);
    } catch (error) {
      logger.error("Error fetching models:", error);
      res.status(500).json({ message: "Failed to fetch models" });
    }
  });

  // Refresh models from CivitAI
  app.post("/api/models/refresh", async (req, res) => {
    try {
      logger.info("Refreshing models from CivitAI with new strategy...");
      
      // Strategy 1: Fetch newest models (recently uploaded)
      logger.info("Fetching newest models...");
      const newestModels = await civitaiService.fetchAndConvertModels(3, 1, 'Newest', 'Month');
      
      // Strategy 2: Fetch most liked models from recent time
      logger.info("Fetching most liked recent models...");
      const likedModels = await civitaiService.fetchAndConvertModels(3, 1, 'Most Liked', 'Week');
      
      // Strategy 3: Fetch from higher page numbers of top rated
      logger.info("Fetching from higher pages...");
      const higherPageModels = await civitaiService.fetchAndConvertModels(4, 10, 'Highest Rated', 'AllTime'); // Start from page 10
      
      // Combine all strategies
      const civitaiModels = [...newestModels, ...likedModels, ...higherPageModels];
      logger.info(`Combined ${civitaiModels.length} models from all strategies`);
      
      let addedCount = 0;
      let skippedCount = 0;
      
      // Add new models, skip existing ones
      for (const model of civitaiModels) {
        // Check if model already exists by civitai_id
        if (model.civitaiId) {
          const existingModel = await storage.getModelByCivitaiId(model.civitaiId);
          if (existingModel) {
            skippedCount++;
            continue; // Skip this model as it already exists
          }
        }
        
        // Model doesn't exist, create it
        await storage.createModel({
          name: model.name,
          description: model.description,
          type: model.type,
          baseModel: model.baseModel,
          rating: model.rating,
          downloads: model.downloads,
          civitaiId: model.civitaiId,
          modelVersion: model.modelVersion,
          arn: model.arn,
          imageUrl: model.imageUrl,
          strengthMin: model.strengthMin,
          strengthMax: model.strengthMax,
          activationWords: model.activationWords,
        });
        addedCount++;
      }
      
      const models = await storage.getAllModels();
      
      // Invalidate models caches after refresh
      responseCache.invalidate('/api/models');
      responseCache.invalidate('/api/models/popular');
      logger.info('🧹 Invalidated /api/models and /api/models/popular caches after refresh');
      
      res.json({ 
        message: `Successfully processed ${civitaiModels.length} models from CivitAI. Added ${addedCount} new models, skipped ${skippedCount} existing models.`,
        totalModels: models.length,
        addedCount,
        skippedCount,
        fetchedCount: civitaiModels.length,
        models: models.slice(0, 10) // Return first 10 for confirmation
      });
    } catch (error) {
      logger.error("Error refreshing models:", error);
      res.status(500).json({ message: "Failed to refresh models from CivitAI" });
    }
  });

  // Import a specific model version by its full AIR URN
  // e.g. POST /api/models/import-arn  { "arn": "urn:air:krea2:diffusionmodel:civitai:2762538@3187539" }
  // The TYPE segment is re-derived server-side from the version's file types, so a
  // wrong segment is corrected rather than stored and failed at generation time.
  app.post("/api/models/import-arn", requireAdmin, async (req, res) => {
    try {
      const { arn } = req.body as { arn?: string };
      if (!arn || typeof arn !== "string") {
        return res.status(400).json({ message: "Missing required field: arn" });
      }

      // Normalize to lowercase so case variants of the same URN are treated as identical
      // (AIR URN spec uses lowercase; CivitAI docs consistently use lowercase)
      const canonicalArn = arn.trim().toLowerCase();

      // Parse the ARN — format: urn:air:<base>:<type>:civitai:<modelId>@<versionId>
      const arnPattern = /^urn:air:[^:]+:[^:]+:civitai:(\d+)@(\d+)$/;
      const match = canonicalArn.match(arnPattern);
      if (!match) {
        return res.status(400).json({
          message:
            "Invalid ARN format. Expected: urn:air:<base>:<type>:civitai:<modelId>@<versionId>",
        });
      }
      const versionId = parseInt(match[2], 10);

      // Dedup by canonical ARN — same version cannot be imported twice
      const existingByArn = await storage.getModelByArn(canonicalArn);
      if (existingByArn) {
        return res.status(409).json({
          message: "This exact model version already exists",
          model: existingByArn,
        });
      }

      // Fetch the specific version from CivitAI (passes canonicalArn so stored ARN is always lowercase)
      const modelData = await civitaiService.fetchModelVersion(versionId, canonicalArn);
      if (!modelData) {
        return res.status(404).json({
          message: "Model version not found on CivitAI. Check the ARN and try again.",
        });
      }

      // fetchModelVersion may have corrected the ARN's type segment, so the dedup
      // check above (run against the supplied ARN) can miss. Re-check against the
      // canonical ARN we are about to store, or the unique index throws a 500.
      if (modelData.arn && modelData.arn !== canonicalArn) {
        const existingByCorrected = await storage.getModelByArn(modelData.arn);
        if (existingByCorrected) {
          return res.status(409).json({
            message: `This model version already exists (imported as ${modelData.arn})`,
            model: existingByCorrected,
          });
        }
      }

      // Persist
      const savedModel = await storage.createModel({
        name: modelData.name,
        description: modelData.description,
        type: modelData.type,
        baseModel: modelData.baseModel,
        rating: modelData.rating,
        downloads: modelData.downloads,
        civitaiId: modelData.civitaiId,
        modelVersion: modelData.modelVersion,
        arn: modelData.arn,
        imageUrl: modelData.imageUrl,
        strengthMin: modelData.strengthMin,
        strengthMax: modelData.strengthMax,
        activationWords: modelData.activationWords,
      });

      logger.info(`✅ Imported model version via ARN: ${savedModel.name} (${arn})`);
      responseCache.invalidate("/api/models");
      responseCache.invalidate("/api/models/popular");

      return res.status(201).json({
        message: `Successfully imported "${savedModel.name}"`,
        model: savedModel,
      });
    } catch (error: any) {
      logger.error("Error importing model by ARN:", error);
      return res.status(500).json({ message: error.message || "Failed to import model" });
    }
  });

  // Download specific model by CivitAI ID
  app.post("/api/models/download/:modelId", async (req, res) => {
    try {
      const { modelId } = req.params;
      const civitaiModelId = parseInt(modelId, 10);
      
      if (isNaN(civitaiModelId)) {
        return res.status(400).json({ message: "Invalid model ID. Please provide a numeric CivitAI model ID." });
      }
      
      logger.info(`Downloading specific model from CivitAI: ${civitaiModelId}`);
      
      // Fetch latest version first so we can deduplicate by exact ARN
      // (the base civitaiId alone is no longer unique — multiple versions can coexist)
      const modelData = await civitaiService.fetchSpecificModel(civitaiModelId);
      if (!modelData) {
        return res.status(404).json({ message: "Model not found on CivitAI. Please check the model ID." });
      }

      // Check by ARN (encodes version ID) so re-importing the same version is blocked
      // while a different version of the same base model is permitted
      const existingModel = modelData.arn
        ? await storage.getModelByArn(modelData.arn)
        : await storage.getModelByCivitaiId(civitaiModelId.toString());
      
      if (existingModel) {
        return res.status(409).json({ 
          message: "This model version already exists in your collection",
          model: existingModel
        });
      }
      
      // Save the model to storage
      const savedModel = await storage.createModel({
        name: modelData.name,
        description: modelData.description,
        type: modelData.type,
        baseModel: modelData.baseModel,
        rating: modelData.rating,
        downloads: modelData.downloads,
        civitaiId: modelData.civitaiId,
        modelVersion: modelData.modelVersion,
        arn: modelData.arn,
        imageUrl: modelData.imageUrl,
        strengthMin: modelData.strengthMin,
        strengthMax: modelData.strengthMax,
        activationWords: modelData.activationWords,
      });
      
      logger.info(`Successfully downloaded model: ${modelData.name}`);
      
      // Invalidate the models list cache so the new model appears immediately
      responseCache.invalidate('/api/models');
      responseCache.invalidate('/api/models/popular');
      logger.info('🧹 Invalidated /api/models caches after specific download');
      
      // Auto-favorite LoRA models for the user
      const favoriteUserId = (req.user as any)?.claims?.sub;
      if (savedModel.type?.toLowerCase() === 'lora' && favoriteUserId) {
        try {
          await storage.addModelFavorite(favoriteUserId, savedModel.id);
          logger.info(`✅ Auto-favorited LoRA model ${savedModel.name} for user ${favoriteUserId}`);
        } catch (favoriteError) {
          // Don't fail the download if favoriting fails
          logger.error('Failed to auto-favorite model:', favoriteError);
        }
      }
      
      res.json({
        message: `Successfully downloaded model: ${modelData.name}`,
        model: savedModel,
        autoFavorited: savedModel.type?.toLowerCase() === 'lora'
      });
    } catch (error) {
      logger.error('Error downloading specific model:', error);
      res.status(500).json({ 
        message: 'Failed to download model', 
        error: (error as any).message 
      });
    }
  });

  // Get popular models (cached for performance)
  app.get("/api/models/popular", async (req, res) => {
    try {
      const cacheKey = '/api/models/popular';
      const clientETag = req.headers['if-none-match'];
      
      // Check cache with ETag support
      const cacheResult = responseCache.getWithETagCheck(cacheKey, clientETag);
      if (cacheResult.hit && cacheResult.notModified) {
        return res.status(304).end();
      }
      if (cacheResult.hit && cacheResult.data) {
        res.setHeader('ETag', cacheResult.etag!);
        res.setHeader('Cache-Control', 'public, max-age=43200');
        return res.json(cacheResult.data);
      }
      
      const models = await storage.getPopularModels();
      
      // Cache for 12 hours (models rarely change)
      const { etag } = responseCache.set(cacheKey, models, CACHE_TTL.MODELS);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=43200');
      res.json(models);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch popular models" });
    }
  });

  // Get model by ID
  app.get("/api/models/:id", async (req, res) => {
    try {
      const model = await storage.getModelById(req.params.id);
      if (!model) {
        return res.status(404).json({ message: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      logger.error("Error fetching model:", error);
      res.status(500).json({ message: "Failed to fetch model" });
    }
  });

  // Debug endpoint to show latest CivitAI data
  app.get("/api/civitai/debug", async (req, res) => {
    try {
      logger.info("Fetching sample data from CivitAI for debugging...");
      
      // Fetch 1 page from each strategy to show what's available
      const newestResult = await civitaiService.fetchModels(1, 10, ['Checkpoint', 'LORA', 'TextualInversion'], 'Newest', 'Month');
      const likedResult = await civitaiService.fetchModels(1, 10, ['Checkpoint', 'LORA', 'TextualInversion'], 'Most Liked', 'Week');
      const topRatedResult = await civitaiService.fetchModels(10, 10, ['Checkpoint', 'LORA', 'TextualInversion'], 'Highest Rated', 'AllTime');
      
      // Get existing model civitai IDs for comparison
      const existingModels = await storage.getAllModels();
      const existingCivitaiIds = new Set(existingModels.map(m => m.civitaiId).filter(Boolean));
      
      const debugData = {
        timestamp: new Date().toISOString(),
        existingModelsCount: existingModels.length,
        existingCivitaiIds: Array.from(existingCivitaiIds).slice(0, 20), // Show first 20 for reference
        strategies: {
          newest: {
            query: 'Newest models from past month',
            url: `https://civitai.com/api/v1/models?limit=10&page=1&types=Checkpoint&types=LORA&types=TextualInversion&sort=Newest&period=Month&nsfw=false`,
            totalAvailable: newestResult.metadata.totalItems,
            fetched: newestResult.items.length,
            sampleModels: newestResult.items.slice(0, 5).map(model => ({
              id: model.id,
              name: model.name,
              type: model.type,
              alreadyExists: existingCivitaiIds.has(model.id.toString())
            }))
          },
          mostLiked: {
            query: 'Most liked models from past week',
            url: `https://civitai.com/api/v1/models?limit=10&page=1&types=Checkpoint&types=LORA&types=TextualInversion&sort=Most Liked&period=Week&nsfw=false`,
            totalAvailable: likedResult.metadata.totalItems,
            fetched: likedResult.items.length,
            sampleModels: likedResult.items.slice(0, 5).map(model => ({
              id: model.id,
              name: model.name,
              type: model.type,
              stats: model.stats,
              alreadyExists: existingCivitaiIds.has(model.id.toString())
            }))
          },
          deepCatalog: {
            query: 'Top rated models from page 10 (deeper catalog)',
            url: `https://civitai.com/api/v1/models?limit=10&page=10&types=Checkpoint&types=LORA&types=TextualInversion&sort=Highest Rated&period=AllTime&nsfw=false`,
            totalAvailable: topRatedResult.metadata.totalItems,
            fetched: topRatedResult.items.length,
            sampleModels: topRatedResult.items.slice(0, 5).map(model => ({
              id: model.id,
              name: model.name,
              type: model.type,
              rating: model.stats.rating,
              downloads: model.stats.downloadCount,
              alreadyExists: existingCivitaiIds.has(model.id.toString())
            }))
          }
        },
        summary: {
          totalNewModelsFound: [
            ...newestResult.items.filter(m => !existingCivitaiIds.has(m.id.toString())),
            ...likedResult.items.filter(m => !existingCivitaiIds.has(m.id.toString())),
            ...topRatedResult.items.filter(m => !existingCivitaiIds.has(m.id.toString()))
          ].length
        }
      };
      
      res.json(debugData);
    } catch (error) {
      logger.error("Error fetching CivitAI debug data:", error);
      res.status(500).json({ message: "Failed to fetch CivitAI debug data", error: (error as any).message });
    }
  });

}
