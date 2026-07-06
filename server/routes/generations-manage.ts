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

export function registerGenerationsManageRoutes(app: Express, ctx: RouteContext) {
  // IMPORTANT: Specific routes must come BEFORE parameterized routes
  // Get unshared generations (private images not shared to community) - MOVED BEFORE :id route
  app.get("/api/generations/unshared", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const unsharedGenerations = await storage.getUnsharedGenerations(userId);
      res.json({ 
        images: unsharedGenerations,
        total: unsharedGenerations.length
      });
    } catch (error) {
      logger.error("Error fetching unshared generations:", error);
      res.status(500).json({ message: "Failed to fetch unshared generations" });
    }
  });

  // Bulk delete generations (with safety checks) - MOVED BEFORE :id route
  app.delete("/api/generations/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { generationIds } = req.body;
      if (!Array.isArray(generationIds) || generationIds.length === 0) {
        return res.status(400).json({ message: "Invalid generation IDs provided" });
      }

      logger.info(`📋 Bulk delete request: ${generationIds.length} images from user ${userId}`);

      // For very large operations, set a longer timeout
      if (generationIds.length > 1000) {
        req.setTimeout(300000); // 5 minutes for large operations
        res.setTimeout(300000);
        logger.info(`⏰ Extended timeout set for large bulk operation (${generationIds.length} items)`);
      }

      // Safety check: Verify all generations are unshared and belong to the authenticated user
      const unsharedGenerations = await storage.getUnsharedGenerations(userId);
      const unsharedGenerationIds = new Set(unsharedGenerations.map(g => g.id));
      
      const invalidIds = generationIds.filter(id => !unsharedGenerationIds.has(id));
      if (invalidIds.length > 0) {
        logger.info(`⚠️  Found ${invalidIds.length} invalid IDs out of ${generationIds.length} requested for deletion`);
        logger.info(`📊 User has ${unsharedGenerations.length} unshared generations available`);
        return res.status(403).json({ 
          message: "Access denied: Some generations are not private or don't belong to you",
          invalidIds: invalidIds.slice(0, 5) // Only show first 5 for brevity
        });
      }

      // Perform bulk deletion
      await storage.bulkDeleteGenerations(generationIds);
      
      logger.info(`✅ Bulk deletion successful: ${generationIds.length} generations deleted for user ${userId}`);
      
      res.json({ 
        message: `Successfully deleted ${generationIds.length} generations`,
        deletedCount: generationIds.length
      });
    } catch (error) {
      logger.error("Error bulk deleting generations:", error);
      res.status(500).json({ message: "Failed to delete generations. Please try with a smaller batch." });
    }
  });

  // Get generation by ID
  app.get("/api/generations/:id", async (req, res) => {
    try {
      const generation = await storage.getGeneration(req.params.id);
      if (!generation) {
        return res.status(404).json({ message: "Generation not found" });
      }
      
      res.json(convertGenerationForResponse(generation));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch generation" });
    }
  });

  // Helper to resolve any generation ID to its batch ID
  const resolveBatchId = async (id: string): Promise<string> => {
    const generation = await storage.getGeneration(id);
    return generation?.batchId || id; // Use batchId if available, fallback to original ID
  };

  // Get batch completion status - fast check using database status only
  app.get("/api/generations/:id/status", async (req, res) => {
    try {
      const startTime = Date.now();
      const inputId = req.params.id;
      
      // Resolve child ID to batch ID if needed
      const batchId = await resolveBatchId(inputId);
      logger.info(`🔍 Status check: ${inputId} -> batch: ${batchId}`);
      
      // Get the main generation record
      const mainGeneration = await storage.getGeneration(batchId);
      if (!mainGeneration) {
        return res.status(404).json({ message: "Batch not found" });
      }

      const totalImages = mainGeneration.quantity || 1;
      let completedImages = 0;
      const imageIdsReady: string[] = [];

      // Fast batch aggregation: ONLY count images with matching batchId
      const recentGenerations = await storage.getUserGenerations(mainGeneration.userId!);
      
      // Find all generations in this batch using batchId matching (strict)
      const allBatchGenerations = [mainGeneration, ...recentGenerations.filter(gen => {
        if (gen.id === mainGeneration.id) return false; // Avoid duplicates
        
        // ONLY include if batchId matches exactly
        return gen.batchId === batchId;
      })];
      
      // Count completed based on imageUrl being set (means image is ready)
      for (const gen of allBatchGenerations) {
        // Consider complete if it has imageUrl (set when Diffus returns the image)
        if (gen.imageUrl) {
          completedImages++;
          imageIdsReady.push(gen.id);
        }
      }

      const isComplete = completedImages >= totalImages;
      const lastUpdate = new Date().toISOString();
      const responseTime = Date.now() - startTime;

      const status = {
        batchId,
        total: totalImages,
        completed: completedImages,
        imageIdsReady,
        isComplete,
        lastUpdate
      };

      logger.info(`📊 Fast status check: ${batchId} - ${completedImages}/${totalImages} complete (${isComplete ? 'COMPLETE' : 'PENDING'}) in ${responseTime}ms`);
      res.json(status);
    } catch (error) {
      logger.error("Failed to check batch status:", error);
      res.status(500).json({ message: "Failed to check batch status" });
    }
  });

  // Delete generation by ID
  app.delete("/api/generations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub; // Get real authenticated user
      const generationId = req.params.id;
      
      logger.info(`🗑️ Delete request for generation ${generationId} by user ${userId}`);
      
      // Check if generation exists and belongs to user
      const generation = await storage.getGeneration(generationId);
      if (!generation) {
        logger.info(`🗑️ Generation ${generationId} not found (already deleted or never existed)`);
        return res.status(404).json({ message: "Generation not found" });
      }
      
      if (generation.userId !== userId) {
        logger.info(`🗑️ User ${userId} not authorized to delete generation ${generationId} (belongs to ${generation.userId})`);
        return res.status(403).json({ message: "Not authorized to delete this generation" });
      }
      
      // Delete the generation
      await storage.deleteGeneration(generationId);
      
      // Verify deletion
      const verifyDeleted = await storage.getGeneration(generationId);
      if (verifyDeleted) {
        logger.error(`❌ Generation ${generationId} still exists after delete!`);
      } else {
        logger.info(`✅ Generation ${generationId} successfully deleted and verified`);
      }
      
      res.json({ message: "Generation deleted successfully" });
    } catch (error) {
      logger.error("Delete generation error:", error);
      res.status(500).json({ message: "Failed to delete generation" });
    }
  });

}
