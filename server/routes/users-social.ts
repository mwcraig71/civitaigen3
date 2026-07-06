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

import { type RouteContext, eq, and, convertGenerationsForResponse, convertUserForResponse } from "./context";

export function registerUsersSocialRoutes(app: Express, ctx: RouteContext) {
  const { objectStorage } = ctx;
  // Delete all images from object storage (admin function)
  app.delete("/api/admin/clear-storage", requireAdmin, async (req, res) => {
    try {
      logger.info("🧹 Starting storage cleanup...");
      
      // Delete all images from object storage
      const imageResults = await objectStorage.deleteAllImages();
      
      // Delete all metadata files
      const metadataResults = await objectStorage.deleteAllMetadata();
      
      // Clear stored image paths from database
      await storage.clearAllStoredImagePaths();
      
      const totalDeleted = imageResults.deletedCount + metadataResults.deletedCount;
      const totalErrors = [...imageResults.errors, ...metadataResults.errors];
      
      logger.info(`✅ Storage cleanup complete: ${totalDeleted} files deleted, ${totalErrors.length} errors`);
      
      res.json({
        success: true,
        summary: {
          imagesDeleted: imageResults.deletedCount,
          metadataDeleted: metadataResults.deletedCount,
          totalDeleted,
          errors: totalErrors
        },
        message: `Successfully deleted ${totalDeleted} files from object storage`
      });
    } catch (error) {
      logger.error("Error during storage cleanup:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to clear storage", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Serve user profile images from object storage
  app.get("/api/user-images/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Get user to find profile image path
      const user = await storage.getUser(userId);
      
      if (!user || !user.profileImage) {
        return res.status(404).json({ message: "Profile image not found" });
      }

      // Add CORS headers
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');

      // Parse the stored image path to get bucket and object info  
      const pathParts = user.profileImage.startsWith('/') 
        ? user.profileImage.split('/') 
        : `/${user.profileImage}`.split('/');
      const bucketName = pathParts[1];
      const objectName = pathParts.slice(2).join('/');
      
      // Get file from object storage and stream to response
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "Profile image file not found" });
      }

      // Get metadata for proper content type
      const [metadata] = await file.getMetadata();
      
      // Set proper headers for image serving with caching
      res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
      res.setHeader('ETag', metadata.etag || '');
      
      // Stream the file to response
      const stream = file.createReadStream();
      stream.pipe(res);
      
      stream.on('end', () => {
        logger.info(`✅ Profile image streamed successfully for user: ${userId}`);
      });
      
      stream.on('error', (error) => {
        logger.error(`❌ Error streaming profile image for user ${userId}:`, error);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to serve profile image' });
        }
      });
      
    } catch (error) {
      logger.error("Error serving profile image:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to serve profile image' });
      }
    }
  });

  // FipFap Search API endpoint (cached for performance)
  app.get("/api/fipfap/search", async (req, res) => {
    try {
      const { q, type = 'all', limit = 20 } = req.query;
      
      const searchTerm = (q && typeof q === 'string') ? q.trim().toLowerCase() : '';
      const searchLimit = Math.min(parseInt(limit as string) || 20, 50);
      const showAllWhenEmpty = searchTerm.length === 0;
      
      // Create cache key based on search parameters
      const cacheKey = createCacheKey('/api/fipfap/search', { q: searchTerm, type, limit: searchLimit });
      const clientETag = req.headers['if-none-match'];
      
      // Check cache with ETag support
      const cacheResult = responseCache.getWithETagCheck(cacheKey, clientETag);
      if (cacheResult.hit && cacheResult.notModified) {
        return res.status(304).end();
      }
      if (cacheResult.hit && cacheResult.data) {
        res.setHeader('ETag', cacheResult.etag!);
        res.setHeader('Cache-Control', 'public, max-age=30');
        return res.json(cacheResult.data);
      }
      
      const results: any[] = [];
      
      // Search characters
      if (type === 'all' || type === 'characters') {
        try {
          // Get all shared images to search characters
          const allImages = await storage.getSharedImages({});
          const characterCounts = new Map<string, number>();
          
          allImages.forEach(img => {
            if (img.characterName) {
              let normalizedName = img.characterName.trim();
              
              // Guard against doubled strings (e.g., "SaraSara" -> "Sara")  
              const words = normalizedName.split(' ');
              if (words.length === 2 && words[0] === words[1]) {
                normalizedName = words[0];
              }
              
              // Show all characters when search is empty, otherwise filter by search term
              if (showAllWhenEmpty || normalizedName.toLowerCase().includes(searchTerm)) {
                characterCounts.set(normalizedName, (characterCounts.get(normalizedName) || 0) + 1);
              }
            }
          });
          
          // Get all shared characters to find profile pictures
          const allCharacters = await storage.getSharedCharacters();
          
          // Convert to results array with profile pictures
          for (const [name, count] of characterCounts.entries()) {
            // Find matching character by name to get profile picture
            const character = allCharacters.find(char => 
              char.name.toLowerCase() === name.toLowerCase()
            );
            
            results.push({
              id: `char_${name.replace(/\s+/g, '_')}`,
              type: 'character',
              name: name,
              description: `Character with ${count} images`,
              matchCount: count,
              avatar: character?.imageUrl || null // Use actual character profile picture
            });
          }
        } catch (error) {
          logger.warn('Character search failed:', error);
        }
      }
      
      // Search prompts (from shared images)
      if (type === 'all' || type === 'prompts') {
        try {
          // Get all shared images to search prompts
          const allImages = await storage.getSharedImages({});
          const foundPrompts: {id: string; excerpt: string; full: string}[] = [];
          
          allImages.forEach(img => {
            if (img.prompt && (showAllWhenEmpty || img.prompt.toLowerCase().includes(searchTerm))) {
              // Create an excerpt for display
              const promptText = img.prompt;
              const searchIndex = promptText.toLowerCase().indexOf(searchTerm);
              
              let excerpt = promptText;
              if (!showAllWhenEmpty && searchIndex !== -1) {
                // Create excerpt around the search term
                const start = Math.max(0, searchIndex - 20);
                const end = Math.min(promptText.length, searchIndex + searchTerm.length + 20);
                excerpt = (start > 0 ? '...' : '') + 
                         promptText.substring(start, end) + 
                         (end < promptText.length ? '...' : '');
              } else if (promptText.length > 50) {
                excerpt = promptText.substring(0, 50) + '...';
              }
              
              foundPrompts.push({
                id: img.id,
                excerpt: excerpt,
                full: promptText
              });
            }
          });
          
          // Limit prompt results to avoid too many
          const limitedPrompts = foundPrompts.slice(0, Math.floor(searchLimit / 2));
          
          for (const prompt of limitedPrompts) {
            results.push({
              id: `prompt_${prompt.id}`,
              type: 'prompt',
              name: prompt.excerpt,
              description: `"${prompt.full.length > 100 ? prompt.full.substring(0, 100) + '...' : prompt.full}"`,
              matchCount: 1,
              avatar: null
            });
          }
        } catch (error) {
          logger.warn('Prompt search failed:', error);
        }
      }
      
      // Sort results by relevance (exact matches first, then partial matches)
      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === searchTerm;
        const bExact = b.name.toLowerCase() === searchTerm;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by match count (for characters)
        const aCount = a.matchCount || 0;
        const bCount = b.matchCount || 0;
        return bCount - aCount;
      });
      
      // Limit final results
      const limitedResults = results.slice(0, searchLimit);
      
      logger.info(`🔍 FipFap search: "${searchTerm}" (${type}) => ${limitedResults.length} results`);
      
      const responseData = { 
        results: limitedResults, 
        total: limitedResults.length 
      };
      
      // Cache search results for 30 seconds (short TTL since data changes frequently)
      const { etag } = responseCache.set(cacheKey, responseData, CACHE_TTL.SHORT);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(responseData);
    } catch (error) {
      logger.error('FipFap search error:', error);
      res.status(500).json({ message: 'Search failed' });
    }
  });

  // Profile API endpoints
  // Get user profile by ID  
  app.get("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = id === "me" ? (req.user as any)?.claims?.sub : id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's real data for profile
      const userGenerations = await storage.getUserGenerations(userId);
      const allModels = await storage.getAllModels();
      const userModelIds = Array.from(new Set(userGenerations.map(gen => gen.modelId).filter((id): id is string => id !== null)));
      const userModels = allModels.filter(model => userModelIds.includes(model.id));
      
      // Add additional profile fields with real data
      const profile = {
        ...user,
        isFollowing: false, // Mock for now
        followerCount: 0,
        followingCount: 0,
        generationCount: userGenerations.length,
        articleCount: 0,
        collectionCount: 0,
      };

      res.json(convertUserForResponse(profile));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // Get user stats
  app.get("/api/users/:id/stats", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = id === "me" ? (req.user as any)?.claims?.sub : id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get user's generations to calculate real stats
      const userGenerations = await storage.getUserGenerations(userId);
      const user = await storage.getUser(userId);
      
      // Calculate join date from user creation or default to 30 days ago
      const joinDate = user?.createdAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const joinedDaysAgo = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const stats = {
        totalLikes: userGenerations.length * 2, // Mock: 2 likes per generation on average
        totalViews: userGenerations.length * 15, // Mock: 15 views per generation on average
        totalDownloads: Math.floor(userGenerations.length * 0.8), // Mock: 80% download rate
        avgRating: userGenerations.length > 0 ? 4.2 : 0, // Mock: 4.2 average rating
        joinedDaysAgo,
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user stats" });
    }
  });

  // Get user models
  app.get("/api/users/:id/models", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = id === "me" ? (req.user as any)?.claims?.sub : id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get models used by this user in their generations
      const userGenerations = await storage.getUserGenerations(userId);
      const allModels = await storage.getAllModels();
      
      // Get unique model IDs used by the user
      const userModelIds = Array.from(new Set(userGenerations.map(gen => gen.modelId).filter((id): id is string => id !== null)));
      
      // Return the actual models used by the user
      const userModels = allModels.filter(model => userModelIds.includes(model.id));
      
      res.json(userModels);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user models" });
    }
  });

  // Get user generations  
  app.get("/api/users/:id/generations", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user.claims.sub;
      const userId = id === "me" ? currentUserId : id;
      
      // Users can only access their own generations
      if (userId !== currentUserId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const generations = await storage.getUserGenerations(userId);
      res.json(convertGenerationsForResponse(generations));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user generations" });
    }
  });

  // Get user articles (empty for now)
  app.get("/api/users/:id/articles", async (req, res) => {
    try {
      res.json([]);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user articles" });
    }
  });

  // Get user collections (empty for now)
  app.get("/api/users/:id/collections", async (req, res) => {
    try {
      res.json([]);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user collections" });
    }
  });

  // Get user followers (empty for now)
  app.get("/api/users/:id/followers", async (req, res) => {
    try {
      res.json([]);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch followers" });
    }
  });

  // Get user following (empty for now)
  app.get("/api/users/:id/following", async (req, res) => {
    try {
      res.json([]);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });

  // Follow/unfollow user (mock for now)
  app.post("/api/users/:id/follow", async (req, res) => {
    try {
      res.json({ success: true, message: "User followed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to follow user" });
    }
  });

}
