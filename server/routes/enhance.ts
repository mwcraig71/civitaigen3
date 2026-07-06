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
import { processEnhancements } from "./generation-pipeline";

export function registerEnhanceRoutes(app: Express, ctx: RouteContext) {
  // ===========================================
  // IMAGE ENHANCEMENT ROUTES (Replicate API)
  // ===========================================

  // Submit images for enhancement (batch up to 20)
  app.post("/api/enhance/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { generationIds, scaleFactor, enhancementModel = 'realesrgan', faceEnhancement } = req.body;

      // Validate inputs
      if (!Array.isArray(generationIds) || generationIds.length === 0) {
        return res.status(400).json({ message: "Please select at least one image to enhance" });
      }

      if (generationIds.length > 20) {
        return res.status(400).json({ message: "Maximum 20 images can be enhanced at once" });
      }

      if (![2, 4].includes(scaleFactor)) {
        return res.status(400).json({ message: "Scale factor must be 2 or 4" });
      }

      if (!['realesrgan', 'gfpgan'].includes(enhancementModel)) {
        return res.status(400).json({ message: `Invalid enhancement model: ${enhancementModel}. Must be 'realesrgan' or 'gfpgan'` });
      }

      // Check user credits (5 credits per enhancement)
      const user = await storage.getUser(userId);
      const creditsPerEnhancement = 5;
      const requiredCredits = generationIds.length * creditsPerEnhancement;

      if (!user || (user.buzzCredits || 0) < requiredCredits) {
        return res.status(400).json({ 
          message: `Insufficient credits. Need ${requiredCredits} credits to enhance ${generationIds.length} image(s) (${creditsPerEnhancement} credits each)`
        });
      }

      // Verify all generations exist (allow upscaling any image, not just own)
      const generations = await Promise.all(
        generationIds.map(id => storage.getGeneration(id))
      );

      const invalidIds = generationIds.filter((id, index) => !generations[index]);
      if (invalidIds.length > 0) {
        return res.status(404).json({ message: "Some images were not found" });
      }

      // Create enhancement records for all images
      const enhancementPromises = generationIds.map(async (generationId) => {
        return await storage.createEnhancedImage({
          userId,
          originalGenerationId: generationId,
          scaleFactor: scaleFactor || 2,
          enhancementModel: enhancementModel || 'realesrgan',
          faceEnhancement: faceEnhancement || false,
        });
      });

      const enhancements = await Promise.all(enhancementPromises);

      // Deduct credits and increment upscale counter for each enhancement
      await storage.deductUserCredits(userId, requiredCredits);
      
      // Increment upscale count for each enhancement
      for (let i = 0; i < enhancements.length; i++) {
        await storage.incrementUserUpscaleCount(userId);
      }

      // Start enhancement processing in background
      processEnhancements(enhancements, generations as Generation[]).catch(error => {
        logger.error("❌ Background enhancement failed:", error);
      });

      res.json({
        enhancements,
        creditsDeducted: requiredCredits,
        message: `Enhancement started for ${enhancements.length} image(s)`
      });
    } catch (error) {
      logger.error("Enhancement submission error:", error);
      res.status(500).json({ message: "Failed to submit enhancement request" });
    }
  });

  // Get enhanced image details
  app.get("/api/enhance/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const enhanced = await storage.getEnhancedImage(req.params.id);

      if (!enhanced) {
        return res.status(404).json({ message: "Enhanced image not found" });
      }

      if (enhanced.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      res.json(enhanced);
    } catch (error) {
      logger.error("Failed to get enhanced image:", error);
      res.status(500).json({ message: "Failed to get enhanced image" });
    }
  });

  // Delete enhanced image
  app.delete("/api/enhance/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const enhanced = await storage.getEnhancedImage(req.params.id);

      if (!enhanced) {
        return res.status(404).json({ message: "Enhanced image not found" });
      }

      if (enhanced.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Delete from storage (this will handle both DB and object storage cleanup)
      await storage.deleteEnhancedImage(req.params.id);

      res.json({ message: "Enhanced image deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete enhanced image:", error);
      res.status(500).json({ message: "Failed to delete enhanced image" });
    }
  });

  // Get user's enhanced images (with pagination support)
  app.get("/api/enhance/user/all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const limit = parseInt(req.query.limit as string) || 20; // Default to 20 images per page
      const offset = parseInt(req.query.offset as string) || 0;

      const { enhancements, total } = await storage.getPaginatedUserEnhancedImages(userId, limit, offset);
      res.json({ enhancements, total, hasMore: offset + enhancements.length < total });
    } catch (error) {
      logger.error("Failed to get user enhancements:", error);
      res.status(500).json({ message: "Failed to get enhanced images" });
    }
  });

  // Serve enhanced images from object storage
  app.get("/api/enhanced-images/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const enhancedImage = await storage.getEnhancedImage(req.params.id);
      
      if (!enhancedImage) {
        logger.info(`❌ Enhanced image not found: ${req.params.id}`);
        return res.status(404).json({ message: "Enhanced image not found" });
      }

      if (enhancedImage.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (!enhancedImage.storedEnhancedPath) {
        logger.info(`❌ Enhanced image not yet processed: ${req.params.id}`);
        return res.status(404).json({ message: "Enhanced image not yet available" });
      }

      logger.info(`🖼️ Serving enhanced image: ${req.params.id} from ${enhancedImage.storedEnhancedPath}`);
      
      // Parse the storage path to get bucket and object key
      const pathParts = enhancedImage.storedEnhancedPath.split('/');
      const bucketName = pathParts[0];
      const objectKey = pathParts.slice(1).join('/');
      
      logger.info(`🗂️ Parsed path - bucket: ${bucketName} object: ${objectKey}`);

      // Get file from object storage and stream to response
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectKey);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        logger.error(`❌ Enhanced image file not found in storage: ${bucketName}/${objectKey}`);
        return res.status(404).json({ message: "Enhanced image file not found in storage" });
      }

      // Get metadata for proper content type
      const [metadata] = await file.getMetadata();
      
      // Set proper headers for image serving with enhanced caching and CORS
      res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Stream the file to response
      const stream = file.createReadStream();
      stream.pipe(res);
      
      stream.on('end', () => {
        logger.info(`✅ Enhanced image streamed successfully: ${req.params.id}`);
      });
      
      stream.on('error', (error) => {
        logger.error(`❌ Error streaming enhanced image ${req.params.id}:`, error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to stream enhanced image" });
        }
      });
    } catch (error) {
      logger.error(`Failed to serve enhanced image ${req.params.id}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to serve enhanced image" });
      }
    }
  });

  // Recovery endpoint to restore lost generations
  app.post("/api/recovery/restore-images", async (req, res) => {
    try {
      logger.info("🔄 Starting image recovery process...");
      
      // Scan for recoverable images
      const recoverableImages = await recoveryService.scanForRecoverableImages();
      logger.info(`📷 Found ${recoverableImages.length} recoverable images`);
      
      if (recoverableImages.length === 0) {
        return res.json({ message: "No recoverable images found", restored: 0 });
      }
      
      // Restore the images as generation records
      const restored = await recoveryService.restoreGenerations(recoverableImages);
      
      logger.info(`✅ Successfully restored ${restored} out of ${recoverableImages.length} images`);
      
      res.json({ 
        message: `Successfully restored ${restored} images from previous sessions`,
        restored,
        total: recoverableImages.length
      });
    } catch (error) {
      logger.error("Failed to restore images:", error);
      res.status(500).json({ message: "Failed to restore images" });
    }
  });

}
