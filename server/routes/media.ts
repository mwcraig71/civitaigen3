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

export function registerMediaRoutes(app: Express, ctx: RouteContext) {
  // Serve images from object storage with production-ready error handling
  app.get("/api/images/:generationId", async (req, res) => {
    try {
      const { generationId } = req.params;
      
      // Get generation to find stored image path
      const generation = await storage.getGeneration(generationId);
      logger.info("🖼️ Serving image for generation:", generationId, "storedImagePath:", generation?.storedImagePath);
      
      if (!generation) {
        logger.error(`❌ Generation not found: ${generationId}`);
        return res.status(404).json({ message: "Generation not found" });
      }
      
      // Add CORS headers for production compatibility
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      
      // If no stored image path, fetch CDN image and apply watermark on-the-fly
      if (!generation.storedImagePath) {
        logger.info("⚠️ No storedImagePath, applying on-the-fly watermark for:", generation.imageUrl);
        if (generation.imageUrl) {
          try {
            // Get user's watermark preference
            const user = generation.userId ? await storage.getUser(generation.userId) : null;
            const showWatermark = user?.showWatermark !== false;
            
            // Fetch the CDN image
            const cdnResponse = await fetch(generation.imageUrl);
            if (!cdnResponse.ok) {
              logger.error(`❌ Failed to fetch CDN image: ${cdnResponse.statusText}`);
              return res.redirect(generation.imageUrl); // Fallback to direct redirect
            }
            
            const imageBuffer = Buffer.from(await cdnResponse.arrayBuffer());
            
            // Apply watermark if enabled
            if (showWatermark) {
              const sharp = (await import('sharp')).default;
              const metadata = await sharp(imageBuffer).metadata();
              const width = metadata.width ?? 512;
              const height = metadata.height ?? 512;
              const fontSize = Math.max(20, Math.floor(width / 28));
              const padding = Math.floor(fontSize * 1.2);
              
              const watermarkSvg = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                  <text 
                    x="${width - padding}" 
                    y="${height - padding}" 
                    font-family="Arial, Helvetica, sans-serif" 
                    font-size="${fontSize}" 
                    font-weight="bold" 
                    fill="white" 
                    fill-opacity="0.85"
                    stroke="black" 
                    stroke-width="2" 
                    stroke-opacity="0.6"
                    text-anchor="end">CiviVerse.com</text>
                </svg>
              `;
              
              const watermarkedBuffer = await sharp(imageBuffer)
                .composite([{ input: Buffer.from(watermarkSvg), top: 0, left: 0 }])
                .jpeg({ quality: 95 })
                .toBuffer();
              
              logger.info(`✨ Applied on-the-fly watermark to CDN image (${width}x${height})`);
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
              return res.send(watermarkedBuffer);
            } else {
              // No watermark, just serve the image
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.send(imageBuffer);
            }
          } catch (watermarkError) {
            logger.error('❌ On-the-fly watermark failed, redirecting to CDN:', watermarkError);
            return res.redirect(generation.imageUrl);
          }
        }
        logger.error(`❌ No image available for generation: ${generationId}`);
        return res.status(404).json({ message: "Image not available" });
      }

      // Parse the stored image path to get bucket and object info  
      const pathParts = generation.storedImagePath.startsWith('/') 
        ? generation.storedImagePath.split('/') 
        : `/${generation.storedImagePath}`.split('/');
      const bucketName = pathParts[1];
      const objectName = pathParts.slice(2).join('/');
      
      logger.info("🗂️ Parsed path - bucket:", bucketName, "object:", objectName);
      
      // Get file from object storage and stream to response
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        logger.error(`❌ Image file not found in storage: ${bucketName}/${objectName}`);
        // Fallback to blob URL if available
        if (generation.imageUrl) {
          logger.info(`🔄 Fallback to blob URL: ${generation.imageUrl}`);
          return res.redirect(generation.imageUrl);
        }
        return res.status(404).json({ message: "Image file not found in storage" });
      }

      // Get metadata for proper content type
      const [metadata] = await file.getMetadata();
      
      // Set proper headers for image serving with enhanced caching and CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Get user's watermark preference (default to true for watermarks)
      const storedUser = generation.userId ? await storage.getUser(generation.userId) : null;
      const showWatermark = storedUser?.showWatermark !== false;

      // PRE-STORED WATERMARK OPTIMIZATION:
      // When showWatermark is true, we serve the stored image DIRECTLY because it was 
      // already watermarked during the background storage process. 
      // This saves significant CPU (no Sharp processing) and memory.
      if (showWatermark) {
        logger.info(`🚀 SERVING PRE-STORED WATERMARKED IMAGE for ${generationId}`);
        res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Long-lived cache
        
        const stream = file.createReadStream();
        const timeout = setTimeout(() => {
          if (!res.headersSent) res.status(504).json({ message: 'Image loading timeout' });
        }, 30000);
        
        stream.on('end', () => clearTimeout(timeout));
        stream.on('error', () => clearTimeout(timeout));
        return stream.pipe(res);
      } else {
        // User disabled watermarks - we must download and serve the original image
        // Since stored images ALWAYS have watermarks, we fallback to the CDN URL for the original
        if (generation.imageUrl) {
          logger.info(`🔄 User disabled watermarks - redirecting to original CDN URL: ${generation.imageUrl}`);
          return res.redirect(generation.imageUrl);
        }
        
        // Final fallback: serve stored image anyway if no CDN URL exists
        res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return file.createReadStream().pipe(res);
      }
      
    } catch (error) {
      logger.error('❌ Error serving image:', error);
      logger.error('❌ Error details:', {
        generationId: req.params.generationId,
        errorMessage: (error as Error).message,
        hasObjectStorage: !!process.env.PRIVATE_OBJECT_DIR
      });
      
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to serve image' });
      }
    }
  });

  // Serve files from object storage (for thumbnails, etc.)
  app.get("/api/storage/*", async (req, res) => {
    try {
      const filePath = '/' + (req.params as Record<string, string>)['0'];
      
      // Parse the file path to get bucket and object info
      const pathParts = filePath.split('/');
      const bucketName = pathParts[1];
      const objectName = pathParts.slice(2).join('/');
      
      if (!bucketName || !objectName) {
        return res.status(400).json({ message: "Invalid storage path" });
      }
      
      // Add CORS headers
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      
      // Get file from object storage
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Get metadata for content type
      const [metadata] = await file.getMetadata();
      
      // Set headers
      res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      
      // Stream file to response
      const stream = file.createReadStream();
      stream.pipe(res);
      
      stream.on('error', (error) => {
        logger.error('❌ Storage stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error streaming file' });
        }
      });
    } catch (error) {
      logger.error('❌ Error serving storage file:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to serve file' });
      }
    }
  });

}
