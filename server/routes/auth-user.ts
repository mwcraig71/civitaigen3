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

import { type RouteContext, eq, and, convertUserForResponse } from "./context";

export function registerAuthUserRoutes(app: Express, ctx: RouteContext) {
  const { objectStorage } = ctx;
  // Auth routes - get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      let user = await storage.getUser(userId);

      // Monthly free credit top-up: atomically top up to 500 if below 500 and 30 days elapsed
      if (user) {
        const applied = await storage.applyMonthlyFreeCredits(userId);
        if (applied) {
          user = await storage.getUser(userId);
          logger.info(`🎁 Monthly free credits topped up for user ${userId} to 500`);
        }
      }

      res.json(convertUserForResponse(user));
    } catch (error) {
      logger.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get current authenticated user (no demo fallback)
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get user's generations to calculate real stats
      const userGenerations = await storage.getUserGenerations(userId);
      const allModels = await storage.getAllModels();
      
      // Calculate unique models used by this user
      const userModelIds = Array.from(new Set(userGenerations.map(gen => gen.modelId).filter((id): id is string => id !== null)));
      const modelsUsed = userModelIds.length;
      
      // Return user with updated stats
      const userWithStats = {
        ...user,
        totalGenerated: userGenerations.length,
        modelsUsed: modelsUsed
      };
      
      res.json(convertUserForResponse(userWithStats));
    } catch (error) {
      logger.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Check if user has their own API key (for credit pricing calculations)
  app.get('/api/user/api-key-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const userApiKey = await storage.getUserApiKey(userId);
      res.json({ hasApiKey: !!userApiKey });
    } catch (error) {
      logger.error("Error checking API key status:", error);
      res.status(500).json({ message: "Failed to check API key status" });
    }
  });

  // Get user's total credits earned from likes and shares
  app.get('/api/user/earnings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Count images shared by this user (6 credits each)
      const sharedImages = await storage.getUserSharedImages(userId);
      const sharesCount = sharedImages.length;
      const creditsFromShares = sharesCount * 6;
      
      // Count likes received on user's shared images from OTHER users (1 credit each)
      let likesFromOthers = 0;
      for (const image of sharedImages) {
        const likes = await storage.getSharedImageLikes(image.id);
        // Count only likes from other users, not self-likes
        const likesFromOtherUsers = likes.filter(like => like.userId !== userId);
        likesFromOthers += likesFromOtherUsers.length;
      }
      const creditsFromLikes = likesFromOthers;
      
      res.json({
        sharesCount,
        creditsFromShares,
        likesReceived: likesFromOthers,
        creditsFromLikes,
        totalCreditsEarned: creditsFromShares + creditsFromLikes
      });
    } catch (error) {
      logger.error("Error fetching user earnings:", error);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // Update user preferences
  app.put('/api/user/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { defaultLandingPage, showWatermark, aiPromptInstructions } = req.body;
      
      if (defaultLandingPage && !['easy-mode', 'generate'].includes(defaultLandingPage)) {
        return res.status(400).json({ message: "Invalid landing page preference" });
      }

      if (aiPromptInstructions !== undefined && aiPromptInstructions !== null) {
        if (typeof aiPromptInstructions !== 'string') {
          return res.status(400).json({ message: "aiPromptInstructions must be a string" });
        }
        if (aiPromptInstructions.length > 2000) {
          return res.status(400).json({ message: "aiPromptInstructions must be 2000 characters or fewer" });
        }
      }
      
      const updateData: { defaultLandingPage?: string; showWatermark?: boolean; aiPromptInstructions?: string | null } = {};
      if (defaultLandingPage !== undefined) updateData.defaultLandingPage = defaultLandingPage;
      if (showWatermark !== undefined) updateData.showWatermark = showWatermark;
      if (aiPromptInstructions !== undefined) updateData.aiPromptInstructions = aiPromptInstructions === '' ? null : aiPromptInstructions;
      
      const updatedUser = await storage.updateUser(userId, updateData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ message: "Preferences updated successfully", user: updatedUser });
    } catch (error) {
      logger.error("Error updating user preferences:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Handle user preferences from onboarding modal
  app.post('/api/user-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Validate request body
      const validationSchema = z.object({
        breastSize: z.number().min(1).max(5).optional(),
        assSize: z.number().min(1).max(5).optional(),
        emailNotifications: z.boolean()
      });
      
      const { breastSize, assSize, emailNotifications } = validationSchema.parse(req.body);
      
      logger.info('📋 Saving user onboarding preferences:', { breastSize, assSize, emailNotifications });
      
      // Save email notification preference to user profile (if provided)
      if (emailNotifications !== undefined) {
        const updateData: { emailNotifications: boolean } = { emailNotifications };
        await storage.updateUser(userId, updateData);
        logger.info('✅ Email notification preference saved to user profile:', emailNotifications);
      }
      
      // Body preferences (breastSize, assSize) are handled by frontend localStorage
      // This endpoint mainly ensures email notification is saved to database
      
      res.json({ 
        message: "User preferences saved successfully",
        emailNotifications: emailNotifications !== undefined ? emailNotifications : null
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      logger.error("Error saving user preferences:", error);
      res.status(500).json({ message: "Failed to save user preferences" });
    }
  });

  // Update user profile
  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const {
        displayName,
        bio,
        website,
        twitter,
        instagram,
        deviantart,
        emailNotifications
      } = req.body;

      // Validate input data
      const updates: Partial<User> = {};
      
      if (displayName !== undefined) {
        if (typeof displayName === 'string' && displayName.length <= 100) {
          updates.displayName = displayName.trim() || null;
        } else {
          return res.status(400).json({ message: "Display name must be 100 characters or less" });
        }
      }

      if (bio !== undefined) {
        if (typeof bio === 'string' && bio.length <= 500) {
          updates.bio = bio.trim() || null;
        } else {
          return res.status(400).json({ message: "Bio must be 500 characters or less" });
        }
      }

      // Validate URLs
      const urlFields = { website, twitter, instagram, deviantart };
      for (const [field, value] of Object.entries(urlFields)) {
        if (value !== undefined) {
          if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '') {
              (updates as any)[field] = null;
            } else {
              // Basic URL validation
              try {
                new URL(trimmedValue.startsWith('http') ? trimmedValue : `https://${trimmedValue}`);
                (updates as any)[field] = trimmedValue;
              } catch {
                return res.status(400).json({ message: `Invalid ${field} URL` });
              }
            }
          }
        }
      }

      // Boolean fields
      if (typeof emailNotifications === 'boolean') {
        updates.emailNotifications = emailNotifications;
      }
      
      // NSFW is always true on this platform - ignore any showNSFW updates
      // All users default to showNSFW=true and it cannot be changed

      const updatedUser = await storage.updateUser(userId, updates);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
      logger.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Configure multer for profile picture uploads
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max file size
      files: 1 // Only one file at a time
    },
    fileFilter: (req, file, cb) => {
      // Accept only image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Upload profile picture endpoint
  app.post('/api/user/profile-image', isAuthenticated, upload.single('profileImage'), async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const file = req.file;
      
      // Validate file type again (extra security)
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({ message: "Only image files are allowed" });
      }

      // Generate unique filename
      const fileExtension = file.mimetype.split('/')[1] || 'jpg';
      const fileName = `profile_${userId}_${Date.now()}.${fileExtension}`;
      const filePath = `profiles/${fileName}`;
      
      try {
        // Store the image in object storage
        const storedImagePath = await objectStorage.storeProfileImage(
          file.buffer,
          filePath
        );
        
        // Update user's profile image in database
        const updatedUser = await storage.updateUser(userId, {
          profileImage: storedImagePath
        });
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }

        logger.info(`📸 Profile picture uploaded for user ${userId}: ${storedImagePath}`);
        
        // Return the updated profile image URL
        res.json({ 
          message: "Profile picture updated successfully",
          profileImageUrl: storedImagePath,
          user: updatedUser
        });
        
      } catch (storageError) {
        logger.error("Error storing profile image:", storageError);
        res.status(500).json({ message: "Failed to store profile image" });
      }
      
    } catch (error) {
      logger.error("Error uploading profile picture:", error);
      
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: "File too large. Maximum size is 5MB." });
        }
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to upload profile picture" });
    }
  });

  // Set profile picture from existing generation
  app.post('/api/user/profile-image/from-generation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { generationId } = req.body;

      if (!generationId) {
        return res.status(400).json({ message: "Generation ID is required" });
      }

      // Get the generation to verify ownership and get image path
      const generation = await storage.getGeneration(generationId);
      
      if (!generation) {
        return res.status(404).json({ message: "Generation not found" });
      }

      if (generation.userId !== userId) {
        return res.status(403).json({ message: "You can only use your own generations as profile pictures" });
      }

      if (!generation.storedImagePath) {
        return res.status(400).json({ message: "Generation does not have a stored image" });
      }

      // Update user's profile image in database
      const updatedUser = await storage.updateUser(userId, {
        profileImage: generation.storedImagePath
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      logger.info(`🖼️ Profile picture set from generation ${generationId} for user ${userId}`);
      
      res.json({ 
        message: "Profile picture updated successfully",
        profileImageUrl: generation.storedImagePath,
        user: updatedUser
      });
      
    } catch (error) {
      logger.error("Error setting profile picture from generation:", error);
      res.status(500).json({ message: "Failed to set profile picture" });
    }
  });

  // NOTE: /api/admin/cleanup-deprecated-models removed — it called a
  // storage method that only existed on the deleted MemStorage class and
  // would have thrown at runtime.

  // Get current user (fallback for demo mode)
  // Remove conflicting demo user route - use /api/auth/user instead

}
