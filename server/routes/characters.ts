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
import { generateCharacterPreviewImage, backfillSharedCharacterPreviews } from "../character-preview-generator";

export function registerCharactersRoutes(app: Express, ctx: RouteContext) {
  // Character management routes
  
  // Serve character images from stored paths
  app.get("/api/character-images/:characterId", async (req, res) => {
    try {
      const { characterId } = req.params;
      const character = await storage.getCharacter(characterId);
      
      if (!character) {
        return res.status(404).json({ message: "Character not found" });
      }
      
      // Add CORS headers
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      
      // If imageUrl is a stored path, serve from object storage
      if (character.imageUrl && character.imageUrl.startsWith('/')) {
        const pathParts = character.imageUrl.split('/');
        const bucketName = pathParts[1];
        const objectName = pathParts.slice(2).join('/');
        
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        
        const [exists] = await file.exists();
        if (!exists) {
          return res.status(404).json({ message: "Image file not found" });
        }
        
        const [metadata] = await file.getMetadata();
        res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        
        const stream = file.createReadStream();
        stream.pipe(res);
        
        stream.on('error', (error) => {
          logger.error('Error streaming character image:', error);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming image' });
          }
        });
      } else if (character.imageUrl) {
        // External URL, redirect
        return res.redirect(character.imageUrl);
      } else {
        return res.status(404).json({ message: "No image available" });
      }
    } catch (error) {
      logger.error('Error serving character image:', error);
      res.status(500).json({ message: "Failed to serve character image" });
    }
  });

  // Helper to resolve character image URLs from stored paths to API endpoints
  const resolveCharacterImageUrl = (character: any) => {
    if (character.imageUrl && character.imageUrl.startsWith('/')) {
      return { ...character, imageUrl: `/api/character-images/${character.id}` };
    }
    return character;
  };

  app.get("/api/characters", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Get user's own characters
      const userCharacters = await storage.getUserCharacters(userId);
      
      // Get all public characters
      const publicCharacters = await storage.getPublicCharacters();
      
      // Combine user characters first, then public characters (avoiding duplicates)
      const userCharacterIds = new Set(userCharacters.map(char => char.id));
      const uniquePublicCharacters = publicCharacters.filter(char => !userCharacterIds.has(char.id));
      
      const allCharacters = [...userCharacters, ...uniquePublicCharacters];
      
      // Resolve stored paths to API URLs
      res.json(allCharacters.map(resolveCharacterImageUrl));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch characters" });
    }
  });

  // Get public characters (cached for performance)
  app.get("/api/characters/public", async (req, res) => {
    try {
      const cacheKey = '/api/characters/public';
      const clientETag = req.headers['if-none-match'];
      
      // Check cache with ETag support
      const cacheResult = responseCache.getWithETagCheck(cacheKey, clientETag);
      if (cacheResult.hit && cacheResult.notModified) {
        return res.status(304).end();
      }
      if (cacheResult.hit && cacheResult.data) {
        res.setHeader('ETag', cacheResult.etag!);
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.json(cacheResult.data);
      }
      
      const characters = await storage.getPublicCharacters();
      const resolvedCharacters = characters.map(resolveCharacterImageUrl);
      
      // Cache for 1 minute
      const { etag } = responseCache.set(cacheKey, resolvedCharacters, CACHE_TTL.MEDIUM);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json(resolvedCharacters);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch public characters" });
    }
  });

  app.get("/api/characters/:id", async (req, res) => {
    try {
      const character = await storage.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json(resolveCharacterImageUrl(character));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch character" });
    }
  });

  app.post("/api/characters", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const data = insertCharacterSchema.parse(req.body);
      
      const processedData = { ...data };
      
      // Removed image protection system
      
      const character = await storage.createCharacter({ ...processedData, userId });
      res.json(character);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid character data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create character" });
    }
  });

  app.put("/api/characters/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const data = insertCharacterSchema.partial().parse(req.body);
      
      // Get the existing character to check ownership
      const existingCharacter = await storage.getCharacter(req.params.id);
      
      if (!existingCharacter) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // Get current user to check admin status
      const currentUser = await storage.getUser(userId);
      
      // Check if the user owns this character OR is an admin
      if (existingCharacter.userId !== userId && !currentUser?.isAdmin) {
        return res.status(403).json({ error: "You can only edit your own characters" });
      }
      
      const processedData = { ...data };
      
      const character = await storage.updateCharacter(req.params.id, processedData, userId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json(character);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid character data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update character" });
    }
  });

  app.delete("/api/characters/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const deleted = await storage.deleteCharacter(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Character not found or not authorized" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete character" });
    }
  });

  app.patch("/api/characters/:id/shared", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { isShared } = req.body;
      
      if (typeof isShared !== 'boolean') {
        return res.status(400).json({ error: "isShared must be a boolean" });
      }

      const updated = await storage.toggleCharacterShared(req.params.id, userId, isShared);
      if (!updated) {
        return res.status(404).json({ error: "Character not found or not authorized" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update character sharing status" });
    }
  });

  // Character Presets - Save generation settings to character
  app.post("/api/characters/:characterId/presets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin-only feature
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Only administrators can create character presets" });
      }
      
      const { characterId } = req.params;
      const { generationId, name, updateCharacter } = req.body;
      
      // Get the generation to copy settings from
      const generation = await storage.getGeneration(generationId);
      if (!generation) {
        return res.status(404).json({ error: "Generation not found" });
      }
      
      // Get the character to verify it exists
      const character = await storage.getCharacter(characterId);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      // Create the preset with all generation settings
      // Use storedImagePath for permanent storage, falling back to imageUrl if not available
      const preset = await storage.createCharacterPreset({
        characterId,
        generationId,
        name: name || `Preset from ${new Date().toLocaleDateString()}`,
        imageUrl: generation.storedImagePath || generation.imageUrl,
        prompt: generation.prompt,
        negativePrompt: generation.negativePrompt,
        modelId: generation.modelId,
        steps: generation.steps ?? undefined,
        cfgScale: generation.cfgScale ?? undefined,
        seed: generation.seed ?? undefined,
        width: generation.width ?? undefined,
        height: generation.height ?? undefined,
        scheduler: generation.scheduler,
        clipSkip: generation.clipSkip ?? undefined,
        loras: generation.loras || [],
        isDefault: false,
        createdBy: userId,
      });
      
      // Optionally update the character's base settings from this generation
      if (updateCharacter) {
        await storage.updateCharacterFromGeneration(characterId, generationId, {
          imageUrl: generation.storedImagePath || generation.imageUrl,
          basePrompt: generation.prompt,
          negativePrompt: generation.negativePrompt,
          baseModel: generation.modelId,
          steps: generation.steps ?? undefined,
          cfgScale: generation.cfgScale ?? undefined,
          seed: generation.seed ?? undefined,
          width: generation.width ?? undefined,
          height: generation.height ?? undefined,
          scheduler: generation.scheduler,
          clipSkip: generation.clipSkip ?? undefined,
          loras: generation.loras || [],
        });
      }
      
      res.json({ success: true, preset });
    } catch (error) {
      logger.error("Error creating character preset:", error);
      res.status(500).json({ error: "Failed to create character preset" });
    }
  });

  app.get("/api/characters/:characterId/presets", isAuthenticated, async (req: any, res) => {
    try {
      const { characterId } = req.params;
      const presets = await storage.getCharacterPresets(characterId);
      
      // Resolve imageUrls - if they are stored paths, convert to API URLs
      const presetsWithUrls = presets.map(preset => {
        if (preset.imageUrl && preset.imageUrl.startsWith('/')) {
          // It's a stored path, use the generation image endpoint
          return {
            ...preset,
            imageUrl: preset.generationId ? `/api/images/${preset.generationId}` : preset.imageUrl
          };
        }
        return preset;
      });
      
      res.json(presetsWithUrls);
    } catch (error) {
      logger.error("Error fetching character presets:", error);
      res.status(500).json({ error: "Failed to fetch character presets" });
    }
  });

  app.delete("/api/characters/:characterId/presets/:presetId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin-only feature
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Only administrators can delete character presets" });
      }
      
      const { presetId } = req.params;
      const deleted = await storage.deleteCharacterPreset(presetId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Preset not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting character preset:", error);
      res.status(500).json({ error: "Failed to delete character preset" });
    }
  });

  app.patch("/api/characters/:characterId/presets/:presetId/default", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin-only feature
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Only administrators can set default presets" });
      }
      
      const { characterId, presetId } = req.params;
      await storage.setDefaultCharacterPreset(characterId, presetId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error setting default preset:", error);
      res.status(500).json({ error: "Failed to set default preset" });
    }
  });

  /**
   * POST /api/admin/backfill-character-previews
   *
   * Admin-only: generate and persist a preview image for every shared character
   * that currently has no imageUrl.  Runs the full backfill in the background
   * and returns immediately with an accepted status; progress is visible in
   * server logs.  Optionally pass `{ characterId }` in the body to process a
   * single character instead of all.
   */
  app.post("/api/admin/backfill-character-previews", requireAdmin, async (req: any, res) => {
    try {
      const { characterId } = req.body || {};

      if (characterId) {
        // Single-character mode
        const character = await storage.getCharacter(characterId);
        if (!character) {
          return res.status(404).json({ error: "Character not found" });
        }
        if (!character.isShared) {
          return res.status(400).json({ error: "Only shared characters can be backfilled via this endpoint" });
        }

        res.json({
          accepted: true,
          message: `Preview generation started for character "${character.name}" — check server logs for progress`,
        });

        // Fire-and-forget
        generateCharacterPreviewImage(character).catch((err) => {
          logger.error(`❌ Backfill: preview generation failed for "${character.name}": ${err instanceof Error ? err.message : String(err)}`);
        });
      } else {
        // Full backfill mode
        res.json({
          accepted: true,
          message: "Backfill started for all shared characters without preview images — check server logs for progress",
        });

        // Fire-and-forget
        backfillSharedCharacterPreviews().catch((err) => {
          logger.error(`❌ Backfill: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    } catch (error) {
      logger.error("Error starting character preview backfill:", error);
      res.status(500).json({ error: "Failed to start backfill" });
    }
  });

}
