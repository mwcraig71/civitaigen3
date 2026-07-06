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

import { type RouteContext, eq, and, convertGenerationForResponse } from "./context";
import { generateImageWithProvider } from "./generation-pipeline";

export function registerGenerationsMetaRoutes(app: Express, ctx: RouteContext) {
  const { objectStorageService } = ctx;
  // Get generation metadata for regeneration
  app.get("/api/generations/:id/metadata", async (req, res) => {
    try {
      const generation = await storage.getGeneration(req.params.id);
      if (!generation) {
        return res.status(404).json({ message: "Generation not found" });
      }

      if (!generation.storedMetadataPath) {
        return res.status(404).json({ message: "No stored metadata found for this generation" });
      }

      const objectStorageService = new ObjectStorageService();
      const metadata = await objectStorageService.getGenerationMetadata(req.params.id);
      
      res.json(metadata);
    } catch (error) {
      logger.error("Failed to fetch generation metadata:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ message: "Metadata file not found" });
      }
      res.status(500).json({ message: "Failed to fetch metadata" });
    }
  });

  // Regenerate from existing generation
  app.post("/api/generations/:id/regenerate", async (req, res) => {
    try {
      const sourceGeneration = await storage.getGeneration(req.params.id);
      if (!sourceGeneration || !sourceGeneration.originalGenerationData) {
        return res.status(404).json({ message: "Source generation or metadata not found" });
      }

      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get user's API key for CivitAI
      const userApiKey = await storage.getUserApiKey(userId);
      
      const originalData = sourceGeneration.originalGenerationData;
      
      // Check user credits with discount for personal API key users  
      const user = await storage.getUser(userId);
      const baseCreditsPerImage = 5;
      const discount = userApiKey ? 0.5 : 0; // 50% discount for personal API key users
      const creditsPerImage = baseCreditsPerImage * (1 - discount);
      const requiredCredits = (originalData.quantity || 1) * creditsPerImage;
      
      logger.info(`💰 Regeneration credit calculation: ${originalData.quantity || 1} images × ${creditsPerImage} credits each = ${requiredCredits} total credits ${userApiKey ? '(50% discount applied)' : '(regular price)'}`);
      if (!user || (user.buzzCredits || 0) < requiredCredits) {
        const discountText = userApiKey ? " (50% discount applied with your API key)" : "";
        return res.status(400).json({ message: `Insufficient Buzz credits. Need ${requiredCredits} credits for ${originalData.quantity || 1} image(s)${discountText}.` });
      }

      // Create new generation with original parameters
      const newGenerationData = {
        modelId: originalData.modelId || sourceGeneration.modelId,
        prompt: originalData.prompt || sourceGeneration.prompt,
        negativePrompt: originalData.negativePrompt || sourceGeneration.negativePrompt,
        seed: originalData.seed || sourceGeneration.seed,
        steps: originalData.steps || sourceGeneration.steps,
        cfgScale: originalData.cfgScale || sourceGeneration.cfgScale || 70,
        width: originalData.width || sourceGeneration.width,
        height: originalData.height || sourceGeneration.height,
        scheduler: originalData.scheduler || sourceGeneration.scheduler,
        clipSkip: originalData.clipSkip || sourceGeneration.clipSkip,
        quantity: originalData.quantity || sourceGeneration.quantity || 1,
        loras: originalData.loras || sourceGeneration.loras || [],
        generationType: (originalData.generationType || sourceGeneration.generationType || "txt2img") as "txt2img" | "img2img",
        denoiseStrength: originalData.denoiseStrength || sourceGeneration.denoiseStrength || 75,
      };

      // Validate that a model is selected
      if (!newGenerationData.modelId || newGenerationData.modelId.trim() === '') {
        return res.status(400).json({ message: "Cannot regenerate: original generation has no model selected" });
      }
      
      const generation = await storage.createGeneration({
        ...newGenerationData,
        userId,
      });

      // Deduct credits
      await storage.updateUserCredits(userId, (user.buzzCredits || 0) - requiredCredits);

      // Start generation with configured provider
      generateImageWithProvider(generation.id, userId, newGenerationData, userApiKey || undefined).catch(error => {
        logger.error("Background regeneration failed:", error);
      });

      res.json({
        ...convertGenerationForResponse(generation),
        regeneratedFrom: req.params.id
      });
    } catch (error) {
      logger.error("Regeneration error:", error);
      res.status(500).json({ message: "Failed to regenerate image" });
    }
  });

}
