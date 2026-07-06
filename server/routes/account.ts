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

export function registerAccountRoutes(app: Express, ctx: RouteContext) {
  // Report content (for users)
  app.post('/api/report', async (req, res) => {
    try {
      const { contentType, contentId, reason, description } = req.body;
      const reporterId = (req.user as any)?.claims?.sub;
      if (!reporterId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const report = await storage.createContentReport({
        reporterId,
        contentType,
        contentId,
        reason,
        description
      });
      
      // Increment report count on the content
      await storage.incrementReportCount(contentType, contentId);
      
      res.status(201).json(report);
    } catch (error) {
      logger.error('Failed to create content report:', error);
      res.status(500).json({ error: 'Failed to report content' });
    }
  });

  // User API Key Management Routes

  // Get user's CivitAI API key status (not the actual key)
  app.get("/api/user/api-key-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const apiKey = await storage.getUserApiKey(userId);
      const user = await storage.getUser(userId);
      
      res.json({ 
        hasApiKey: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        maskedKey: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
        platformGenerations: user?.platformGenerations || 0
      });
    } catch (error) {
      logger.error("Error checking API key status:", error);
      res.status(500).json({ message: "Failed to check API key status" });
    }
  });

  // Update user's CivitAI API key
  app.post("/api/user/api-key", isAuthenticated, async (req, res) => {
    try {
      const { apiKey } = req.body;
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ message: "Valid API key is required" });
      }

      // Basic validation - CivitAI API keys typically start with specific patterns
      if (apiKey.length < 10) {
        return res.status(400).json({ message: "API key appears to be invalid (too short)" });
      }
      
      const updatedUser = await storage.updateUserApiKey(userId, apiKey.trim());
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ 
        message: "API key updated successfully",
        hasApiKey: true,
        maskedKey: `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
      });
    } catch (error) {
      logger.error("Error updating API key:", error);
      res.status(500).json({ message: "Failed to update API key" });
    }
  });

  // Remove user's CivitAI API key
  app.delete("/api/user/api-key", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const updatedUser = await storage.updateUserApiKey(userId, '');
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ 
        message: "API key removed successfully",
        hasApiKey: false
      });
    } catch (error) {
      logger.error("Error removing API key:", error);
      res.status(500).json({ message: "Failed to remove API key" });
    }
  });

  // Account deletion route
  app.delete("/api/user/delete-account", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Perform complete account deletion
      await storage.deleteUser(userId);
      
      res.json({
        message: "Account and all associated data have been permanently deleted."
      });
    } catch (error) {
      logger.error("Error deleting user account:", error);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  });


}
