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

export function registerQualityGroupsRoutes(app: Express, ctx: RouteContext) {
  // Quality Groups API
  app.get("/api/quality-groups", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const groups = await storage.getUserQualityGroups(userId);
      res.json(groups);
    } catch (error) {
      logger.error("Error fetching quality groups:", error);
      res.status(500).json({ error: "Failed to fetch quality groups" });
    }
  });

  app.get("/api/quality-groups/public", async (req, res) => {
    try {
      const groups = await storage.getPublicQualityGroups();
      res.json(groups);
    } catch (error) {
      logger.error("Error fetching public quality groups:", error);
      res.status(500).json({ error: "Failed to fetch public quality groups" });
    }
  });

  app.get("/api/quality-groups/:id", async (req, res) => {
    try {
      const group = await storage.getQualityGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Quality group not found" });
      }
      res.json(group);
    } catch (error) {
      logger.error("Error fetching quality group:", error);
      res.status(500).json({ error: "Failed to fetch quality group" });
    }
  });

  app.post("/api/quality-groups", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const data = insertQualityGroupSchema.parse(req.body);
      const group = await storage.createQualityGroup({ ...data, userId });
      res.status(201).json(group);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      logger.error("Error creating quality group:", error);
      res.status(500).json({ error: "Failed to create quality group" });
    }
  });

  app.put("/api/quality-groups/:id", async (req, res) => {
    try {
      const data = insertQualityGroupSchema.partial().parse(req.body);
      const group = await storage.updateQualityGroup(req.params.id, data);
      if (!group) {
        return res.status(404).json({ error: "Quality group not found" });
      }
      res.json(group);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      logger.error("Error updating quality group:", error);
      res.status(500).json({ error: "Failed to update quality group" });
    }
  });

  app.delete("/api/quality-groups/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const deleted = await storage.deleteQualityGroup(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Quality group not found or not authorized" });
      }
      res.json({ message: "Quality group deleted successfully" });
    } catch (error) {
      logger.error("Error deleting quality group:", error);
      res.status(500).json({ error: "Failed to delete quality group" });
    }
  });

}
