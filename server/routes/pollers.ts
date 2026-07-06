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
import { batchPoller } from "./generation-pipeline";

export function registerPollersRoutes(app: Express, ctx: RouteContext) {
  // Poller management routes
  app.post("/api/pollers/cleanup-all", isAuthenticated, async (req: any, res) => {
    try {
      const activeCount = batchPoller.getActiveCount();
      logger.info(`🛑 User requested cleanup of ${activeCount} active pollers`);
      batchPoller.cleanupAll();
      res.json({ success: true, cleaned: activeCount });
    } catch (error) {
      logger.error("Error cleaning up pollers:", error);
      res.status(500).json({ error: "Failed to cleanup pollers" });
    }
  });

  app.get("/api/pollers/status", isAuthenticated, async (req: any, res) => {
    try {
      const activeCount = batchPoller.getActiveCount();
      res.json({ activePollers: activeCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to get poller status" });
    }
  });

}
