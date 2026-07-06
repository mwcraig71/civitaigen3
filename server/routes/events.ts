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

export function registerEventsRoutes(app: Express, ctx: RouteContext) {
  // Events endpoints
  app.get("/api/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const events = await storage.getUserEvents(userId);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const data = insertEventSchema.parse(req.body);
      const event = await storage.createEvent({ ...data, userId });
      res.json(event);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid event data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.delete("/api/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const deleted = await storage.deleteEvent(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // Event steps endpoints
  app.get("/api/events/:eventId/steps", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const steps = await storage.getEventSteps(req.params.eventId, userId);
      res.json(steps);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch event steps" });
    }
  });

  app.post("/api/events/:eventId/steps", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      // Only validate the fields we expect from the frontend
      const data = insertEventStepSchema.pick({
        title: true,
        description: true,
        wordsToAdd: true,
        wordsToRemove: true,
      }).parse(req.body);
      
      // Get the next step number
      const existingSteps = await storage.getEventSteps(req.params.eventId, userId);
      const stepNumber = existingSteps.length + 1;
      
      const step = await storage.createEventStep({
        ...data,
        eventId: req.params.eventId,
        stepNumber,
      });
      res.json(step);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid step data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create step" });
    }
  });

  // Reorder event steps (must be BEFORE the generic :stepId route)
  app.put("/api/events/:eventId/steps/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { stepIds } = req.body; // Array of step IDs in new order
      
      if (!Array.isArray(stepIds)) {
        return res.status(400).json({ error: "stepIds must be an array" });
      }
      
      const success = await storage.reorderEventSteps(req.params.eventId, stepIds, userId);
      if (!success) {
        return res.status(404).json({ error: "Event not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder steps" });
    }
  });

  app.put("/api/events/:eventId/steps/:stepId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const data = insertEventStepSchema.pick({
        title: true,
        description: true,
        wordsToAdd: true,
        wordsToRemove: true,
      }).partial().parse(req.body);
      const step = await storage.updateEventStep(req.params.stepId, data, userId);
      if (!step) {
        return res.status(404).json({ error: "Step not found" });
      }
      res.json(step);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid step data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update step" });
    }
  });

  app.delete("/api/events/:eventId/steps/:stepId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const deleted = await storage.deleteEventStep(req.params.stepId, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Step not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete step" });
    }
  });


  // Copy/duplicate event with all steps
  app.post("/api/events/:eventId/copy", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const copiedEvent = await storage.copyEvent(req.params.eventId, userId);
      
      if (!copiedEvent) {
        return res.status(404).json({ error: "Event not found or unauthorized" });
      }
      
      res.json(copiedEvent);
    } catch (error) {
      res.status(500).json({ error: "Failed to copy event" });
    }
  });

  // Save all event words to favorites
  app.post("/api/events/:eventId/save-words", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const result = await storage.saveEventWordsToFavorites(req.params.eventId, userId);
      
      if (!result) {
        return res.status(404).json({ error: "Event not found or unauthorized" });
      }
      
      res.json({ 
        success: true, 
        addedWords: result.addedWords,
        skippedWords: result.skippedWords,
        message: `Added ${result.addedWords} new words to favorites (${result.skippedWords} already existed)`
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to save words to favorites" });
    }
  });

  // Favorite prompt words endpoints
  app.get("/api/favorite-words", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const words = await storage.getFavoriteWords(userId);
      res.json(words);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch favorite words" });
    }
  });

  app.post("/api/favorite-words", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const data = insertFavoritePromptWordSchema.parse(req.body);
      const word = await storage.createFavoriteWord({ ...data, userId });
      res.json(word);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid word data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create favorite word" });
    }
  });

  app.delete("/api/favorite-words/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const deleted = await storage.deleteFavoriteWord(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Favorite word not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete favorite word" });
    }
  });

  // User preferences analytics for admin
  app.get("/api/admin/user-preferences-analytics", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const analytics = await storage.getUserPreferencesAnalytics();
      res.json(analytics);
    } catch (error) {
      logger.error("Error fetching user preferences analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics data" });
    }
  });

  // Save user preferences (for authenticated users)
  app.post("/api/user-preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { breastSize, assSize } = req.body;
      
      if (!breastSize || !assSize || breastSize < 1 || breastSize > 5 || assSize < 1 || assSize > 5) {
        return res.status(400).json({ message: "breastSize and assSize must be between 1 and 5" });
      }
      
      const preferences = await storage.saveUserPreferences(userId, { breastSize, assSize });
      res.json(preferences);
    } catch (error) {
      logger.error("Error saving user preferences:", error);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

}
