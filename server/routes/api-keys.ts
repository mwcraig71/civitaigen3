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

import { type RouteContext, eq, and, batchTracker, broadcastToUser } from "./context";
import { generateImageWithCivitAI, pollCivitAIJob } from "./generation-pipeline";

export function registerApiKeysRoutes(app: Express, ctx: RouteContext) {
  // Register the CivitAI generation handler and batch tracker for API v1 
  setGenerateImageHandler(generateImageWithCivitAI);
  setBatchTracker(batchTracker);
  setSubmitTransformHandler(async (generationId, userId, params, userApiKey) => {
    try {
      let submit;
      if (params.mode === "img2vid") {
        submit = await civitaiOrchestration.submitImg2Vid({
          sourceImageUrl: params.sourceImageUrl,
          prompt: params.prompt,
          negativePrompt: params.negativePrompt,
          engine: (params.videoEngine as any) || "wan",
          durationSeconds: params.durationSeconds || 4,
          fps: params.fps || 16,
          motionStrength: params.motionStrength,
          seed: params.seed,
        }, userApiKey);
      } else {
        // img2img runs on Flux 2 Klein (Civitai-hosted) and does not use the
        // selected checkpoint's ARN — resolve the model only for metadata.
        const model = params.modelId ? await storage.getModel(params.modelId) : null;
        submit = await civitaiOrchestration.submitImg2Img({
          sourceImageUrl: params.sourceImageUrl,
          prompt: params.prompt,
          negativePrompt: params.negativePrompt,
          modelArn: model?.arn || undefined,
          baseModel: model?.baseModel || "",
          denoiseStrength: params.denoiseStrength,
          steps: params.steps,
          cfgScale: params.cfgScale,
          scheduler: params.scheduler,
          width: params.width,
          height: params.height,
          seed: params.seed,
        }, userApiKey);
      }
      await storage.updateGenerationStatus(generationId, "processing", undefined, submit.token);
      broadcastToUser(userId, { type: "generation_update", generationId, status: "processing", progress: 10 });
      const pollReq = {
        mode: params.mode,
        mediaType: params.mode === "img2vid" ? "video" : "image",
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        sourceImageUrl: params.sourceImageUrl,
        videoEngine: params.videoEngine,
        fps: params.fps,
        durationSeconds: params.durationSeconds,
      };
      const pollerService = { getJobStatus: (t: string, k?: string) => civitaiOrchestration.getWorkflowStatus(t, k) };
      pollCivitAIJob(submit.token, generationId, userId, pollerService, pollReq, userApiKey);
    } catch (err) {
      logger.error(`❌ API v1 transform failed for ${generationId}:`, err);
      await storage.updateGenerationStatus(generationId, "failed");
      // Refund exactly what was charged — read cost from batchTracker so this
      // works correctly for both img2img and img2vid regardless of admin pricing.
      const bt = batchTracker.get(generationId) as any;
      const refundAmount = bt?.transformCost ?? 0;
      if (refundAmount > 0) {
        const u = await storage.getUser(userId);
        if (u) {
          await storage.updateUserCredits(userId, (u.buzzCredits || 0) + refundAmount);
          logger.info(`💰 Refunded ${refundAmount} Buzz to ${userId} (API v1 transform failure)`);
        }
      }
      batchTracker.delete(generationId);
      broadcastToUser(userId, { type: "generation_update", generationId, status: "failed", progress: 0, message: (err as Error).message || "Transform failed" });
    }
  });

  // Mount API v1 router for external bot/service access
  app.use("/api/v1", apiV1Router);

  // API Key Management (session-authenticated, not API key auth)
  app.get("/api/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const keys = await storage.getUserApiKeys(userId);
      res.json({
        keys: keys.map(k => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          dailyLimit: k.dailyLimit,
          dailyUsage: k.dailyUsage,
          isActive: k.isActive,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        })),
      });
    } catch (error) {
      logger.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required to create API keys" });

      const { name, dailyLimit, targetUserId } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });

      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 10) + "...";

      const apiKey = await storage.createApiKey(
        targetUserId || userId,
        name,
        keyHash,
        keyPrefix,
        dailyLimit || 1200
      );

      res.json({
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        dailyLimit: apiKey.dailyLimit,
        message: "Save this key securely - it won't be shown again!",
      });
    } catch (error) {
      logger.error("Error creating API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/api-keys/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const success = await storage.deactivateApiKey(req.params.id, req.body.targetUserId || userId);
      if (success) {
        res.json({ message: "API key revoked" });
      } else {
        res.status(404).json({ error: "API key not found" });
      }
    } catch (error) {
      logger.error("Error revoking API key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  app.get("/api/user/external-api-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const keys = await storage.getUserApiKeys(userId);
      const activeKey = keys.find(k => k.isActive);
      res.json({
        hasKey: !!activeKey,
        keyPrefix: activeKey?.keyPrefix || null,
        dailyLimit: activeKey?.dailyLimit || 5000,
        dailyUsage: activeKey?.dailyUsage || 0,
        createdAt: activeKey?.createdAt || null,
      });
    } catch (error) {
      logger.error("Error fetching user external API key:", error);
      res.status(500).json({ error: "Failed to fetch external API key status" });
    }
  });

  app.post("/api/user/external-api-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const keys = await storage.getUserApiKeys(userId);
      const activeKeys = keys.filter(k => k.isActive);
      for (const key of activeKeys) {
        await storage.deactivateApiKey(key.id, userId);
      }

      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 10) + "...";

      const apiKey = await storage.createApiKey(
        userId,
        `${user.displayName || user.username} API Key`,
        keyHash,
        keyPrefix,
        5000
      );

      logger.info(`🔑 User ${user.username} generated external API key`);

      res.json({
        id: apiKey.id,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        dailyLimit: apiKey.dailyLimit,
        message: "Save this key securely - it won't be shown again!",
      });
    } catch (error) {
      logger.error("Error creating user external API key:", error);
      res.status(500).json({ error: "Failed to create external API key" });
    }
  });

  app.delete("/api/user/external-api-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const keys = await storage.getUserApiKeys(userId);
      const activeKey = keys.find(k => k.isActive);
      if (!activeKey) return res.status(404).json({ error: "No active API key found" });

      const success = await storage.deactivateApiKey(activeKey.id, userId);
      if (success) {
        logger.info(`🔑 User external API key revoked for ${userId}`);
        res.json({ message: "API key revoked successfully" });
      } else {
        res.status(404).json({ error: "API key not found" });
      }
    } catch (error) {
      logger.error("Error revoking user external API key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

}
