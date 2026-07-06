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

export function registerAdminStorageRoutes(app: Express, ctx: RouteContext) {
  const { objectStorage } = ctx;

  // Removed: /api/user/buy-credits endpoint - consolidated into main /api/create-payment-intent flow

  // Removed: /api/user/complete-credit-purchase endpoint - consolidated into main /api/complete-purchase flow

  // Manually add 100 credits for the user who just had a successful payment
  app.post("/api/admin/manual-credit-fix", requireAdmin, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Add 100 credits to compensate for the missed webhook
      const newBalance = (user.buzzCredits || 0) + 100;
      await storage.updateUserCredits(userId, newBalance);
      
      logger.info(`🔧 Manual credit fix: Added 100 credits to user ${userId}, new balance: ${newBalance}`);
      
      res.json({ 
        success: true,
        message: "Credits added to compensate for payment processing issue",
        creditsAdded: 100,
        newBalance
      });
    } catch (error) {
      logger.error("Error applying manual credit fix:", error);
      res.status(500).json({ message: "Failed to apply credit fix" });
    }
  });

  // Admin endpoint to browse object storage folders
  app.get("/api/admin/object-storage", requireAdmin, async (req: any, res) => {
    try {
      // Check admin permissions
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const objectStorage = new ObjectStorageService();
      const privateObjectDir = objectStorage.getPrivateObjectDir();
      const folder = req.query.folder || 'cards/prompts/';
      
      const bucket = objectStorageClient.bucket(privateObjectDir);
      const [files] = await bucket.getFiles({
        prefix: folder,
      });
      
      const fileList = files.map(file => ({
        name: file.name,
        size: file.metadata.size,
        created: file.metadata.timeCreated,
        updated: file.metadata.updated,
        fullPath: `${privateObjectDir}/${file.name}`
      }));
      
      res.json({
        bucket: privateObjectDir,
        folder: folder,
        totalFiles: fileList.length,
        files: fileList
      });
    } catch (error) {
      logger.error("Error listing object storage:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  // Admin endpoint to get object storage statistics
  app.get("/api/admin/object-storage/stats", requireAdmin, async (req: any, res) => {
    try {
      // Check admin permissions
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const objectStorage = new ObjectStorageService();
      const privateObjectDir = objectStorage.getPrivateObjectDir();
      const bucket = objectStorageClient.bucket(privateObjectDir);
      
      // Get files from different folders
      const folders = ['cards/prompts/', 'cards/characters/', 'cards/scenes/', 'images/', 'metadata/'];
      const stats = await Promise.all(
        folders.map(async (folder) => {
          try {
            const [files] = await bucket.getFiles({ prefix: folder });
            const totalSize = files.reduce((sum, file) => sum + (parseInt(String(file.metadata.size ?? '0')) || 0), 0);
            return {
              folder,
              fileCount: files.length,
              totalSize: totalSize,
              lastModified: files.length > 0 ? Math.max(...files.map(f => new Date(String(f.metadata.updated ?? 0)).getTime())) : null
            };
          } catch (error) {
            return { folder, fileCount: 0, totalSize: 0, lastModified: null };
          }
        })
      );
      
      res.json({
        bucket: privateObjectDir,
        folders: stats,
        totalFiles: stats.reduce((sum, s) => sum + s.fileCount, 0),
        totalSize: stats.reduce((sum, s) => sum + s.totalSize, 0)
      });
    } catch (error) {
      logger.error("Error getting storage stats:", error);
      res.status(500).json({ error: "Failed to get storage statistics" });
    }
  });

}
