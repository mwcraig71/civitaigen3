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
import { learnFromLikedImage } from "../preference-learning";

export function registerFavoritesRoutes(app: Express, ctx: RouteContext) {
  // Get user favorites
  app.get("/api/favorites", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.json([]); // Return empty array for unauthenticated users
      }
      const userId = (req.user as any).claims.sub;
      const favorites = await storage.getUserFavorites(userId);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  // Get favorites with full generation data for fip-fap browsing
  app.get("/api/favorites/for-fipfap", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Get user's favorites
      const favorites = await storage.getUserFavorites(userId);
      
      // Get full generation data for each favorite
      const favoritesWithGenerations = [];
      for (const favorite of favorites) {
        if (!favorite.generationId) continue;
        const generation = await storage.getGeneration(favorite.generationId);
        if (generation && generation.status === 'completed' && (generation.imageUrl || (generation as any).videoUrl)) {
          favoritesWithGenerations.push({
            id: generation.id,
            imageUrl: `/api/images/${generation.id}`, // Use our image serving endpoint instead of blob URL
            // Pass video fields so fip-fap can render video player
            videoUrl: (generation as any).videoUrl || undefined,
            videoThumbnailUrl: (generation as any).videoThumbnailUrl || undefined,
            prompt: generation.prompt || '',
            negativePrompt: generation.negativePrompt || '',
            modelUsed: (generation as { modelName?: string | null }).modelName || generation.modelId || 'Unknown Model',
            characterName: generation.characterName,
            sceneName: generation.sceneName,
            width: generation.width ?? undefined,
            height: generation.height ?? undefined,
            steps: generation.steps ?? undefined,
            cfgScale: generation.cfgScale ?? undefined,
            seed: generation.seed ?? undefined,
            loras: generation.loras || [],
            likes: 0, // Not applicable for personal favorites
            downloads: 0,
            views: 0,
            isNSFW: false,
            createdAt: favorite.createdAt,
            userId: userId
          });
        }
      }
      
      // Apply pagination
      const paginatedFavorites = favoritesWithGenerations.slice(offset, offset + limit);
      const hasMore = offset + limit < favoritesWithGenerations.length;
      
      res.json({
        images: paginatedFavorites,
        hasMore,
        total: favoritesWithGenerations.length,
        offset,
        limit
      });
    } catch (error) {
      logger.error("Error fetching favorites for fip-fap:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  // Add favorite
  app.post("/api/favorites", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      const { generationId } = insertFavoriteSchema.parse(req.body);
      
      const favorite = await storage.addFavorite(userId, generationId!);
      res.json(favorite);

      // Learn from this like in the background: the image's prompt feeds the
      // user's taste profile so AI Enhance reflects what they favorite.
      (async () => {
        const generation = await storage.getGeneration(generationId!);
        await learnFromLikedImage(userId, generation?.prompt);
      })().catch((e) => logger.error('⚠️ Favorite taste-learning failed:', e));
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      res.status(500).json({ message: "Failed to add favorite" });
    }
  });

  // Remove favorite
  app.delete("/api/favorites/:generationId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.removeFavorite(userId, req.params.generationId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove favorite" });
    }
  });

  // Model Favorites endpoints
  app.get("/api/model-favorites", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.json([]); // Return empty array for unauthenticated users
      }
      const userId = (req.user as any).claims.sub;
      const modelFavorites = await storage.getUserModelFavorites(userId);
      res.json(modelFavorites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch model favorites" });
    }
  });

  app.post("/api/model-favorites", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      const { modelId } = insertModelLikeSchema.parse(req.body);
      
      const modelFavorite = await storage.addModelFavorite(userId, modelId!);
      res.json(modelFavorite);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      res.status(500).json({ message: "Failed to add model favorite" });
    }
  });

  app.delete("/api/model-favorites/:modelId", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = (req.user as any).claims.sub;
      await storage.removeModelFavorite(userId, req.params.modelId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove model favorite" });
    }
  });

  // Setup default model favorites for all users (admin only)
  app.post("/api/setup-default-favorites", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Check if user is admin
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.setupDefaultModelFavorites();
      res.json({ message: "Default model favorites set up successfully for all users" });
    } catch (error) {
      logger.error('Error setting up default favorites:', error);
      res.status(500).json({ message: "Failed to setup default model favorites" });
    }
  });

  // Get user favorited generations
  app.get("/api/favorites/generations", async (req: any, res) => {
    try {
      if (!req.isAuthenticated?.() || !(req.user as any)?.claims?.sub) {
        return res.json([]); // Return empty array for unauthenticated users
      }
      const userId = (req.user as any).claims.sub;
      const favorites = await storage.getUserFavorites(userId);
      const generations = [];
      
      for (const favorite of favorites) {
        const generation = await storage.getGeneration(favorite.generationId!);
        if (generation) {
          // Apply the same imageUrl processing as regular generations
          let imageUrl = generation.imageUrl;
          if (generation.storedImagePath) {
            // Create permanent URL that serves from object storage
            imageUrl = `/api/images/${generation.id}`;
          }
          
          generations.push({
            ...generation,
            imageUrl
          });
        }
      }
      
      res.json(generations.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime()));
    } catch (error) {
      logger.error("Get favorited generations error:", error);
      res.status(500).json({ message: "Failed to fetch favorited generations" });
    }
  });

}
