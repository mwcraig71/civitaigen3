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

export function registerSavedPromptsRoutes(app: Express, ctx: RouteContext) {
  // Saved Prompts routes
  app.get("/api/saved-prompts", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      const prompts = await storage.getUserSavedPrompts(userId);
      res.json(prompts);
    } catch (error) {
      logger.error("Error fetching saved prompts:", error);
      res.status(500).json({ error: "Failed to fetch saved prompts" });
    }
  });

  app.post("/api/saved-prompts", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      const data = insertSavedPromptSchema.parse(req.body);
      const prompt = await storage.createSavedPrompt({ ...data, userId });
      res.status(201).json(prompt);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      logger.error("Error creating saved prompt:", error);
      res.status(500).json({ error: "Failed to create saved prompt" });
    }
  });

  app.put("/api/saved-prompts/:id", async (req: any, res) => {
    logger.info(`🚨 PROMPT UPDATE ROUTE ENTERED for ID: ${req.params.id}`);
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        logger.info(`❌ PROMPT UPDATE: Authentication failed`);
        return res.status(401).json({ error: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      
      // Debug: Log the entire request body to see what's being sent
      logger.info(`🔍 PROMPT UPDATE DEBUG: Full request body:`, JSON.stringify(req.body, null, 2));
      
      const data = insertSavedPromptSchema.partial().parse(req.body);
      logger.info(`🔍 PROMPT UPDATE DEBUG: Parsed data:`, JSON.stringify(data, null, 2));
      
      // Get the existing saved prompt to check for previous protected image
      const existingPrompt = await storage.getSavedPrompt(req.params.id);
      const processedData = { ...data };
      
      // Debug: Log all imageUrl updates
      if (data.imageUrl) {
        logger.info(`🔍 PROMPT DEBUG: Received imageUrl: "${data.imageUrl}"`);
        logger.info(`🔍 PROMPT DEBUG: Type: ${typeof data.imageUrl}, Length: ${data.imageUrl.length}`);
      }
      
      // Removed image protection system
      
      const prompt = await storage.updateSavedPrompt(req.params.id, processedData, userId);
      if (!prompt) {
        return res.status(404).json({ error: "Saved prompt not found or not authorized" });
      }
      res.json(prompt);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      logger.error("Error updating saved prompt:", error);
      res.status(500).json({ error: "Failed to update saved prompt" });
    }
  });

  app.delete("/api/saved-prompts/:id", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      
      // Get the saved prompt before deleting to clean up its image
      const existingPrompt = await storage.getSavedPrompt(req.params.id);
      
      const deleted = await storage.deleteSavedPrompt(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Saved prompt not found or not authorized" });
      }
      
      // Removed image protection system
      
      res.json({ message: "Saved prompt deleted successfully" });
    } catch (error) {
      logger.error("Error deleting saved prompt:", error);
      res.status(500).json({ error: "Failed to delete saved prompt" });
    }
  });

}
