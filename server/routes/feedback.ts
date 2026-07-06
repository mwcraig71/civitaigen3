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

export function registerFeedbackRoutes(app: Express, ctx: RouteContext) {
  // Check if signups are blocked
  app.get("/api/signups-blocked", async (req, res) => {
    try {
      const setting = await storage.getPlatformSetting("signups_blocked");
      const blocked = setting?.value === "true";
      res.json({ blocked });
    } catch (error) {
      logger.error("Error checking signup status:", error);
      res.status(500).json({ message: "Failed to check signup status" });
    }
  });

  // User Feedback Routes
  app.post("/api/feedback", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const { type, title, description, priority } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      if (!type || !title || !description) {
        return res.status(400).json({ message: "Type, title, and description are required" });
      }
      
      const feedback = await storage.createUserFeedback({
        userId,
        type,
        title,
        description,
        priority: priority || 'medium'
      });
      
      res.json({ message: "Feedback submitted successfully", feedback });
    } catch (error) {
      logger.error("Error creating feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const feedback = await storage.getUserFeedback(userId);
      res.json(feedback);
    } catch (error) {
      logger.error("Error fetching user feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Admin Feedback Management Routes
  app.get("/api/admin/feedback", requireAdmin, async (req, res) => {
    try {
      const feedback = await storage.getAllFeedback();
      
      // Enrich feedback with user names
      const enrichedFeedback = await Promise.all(
        feedback.map(async (f) => {
          const user = await storage.getUser(f.userId);
          return {
            ...f,
            userName: user?.username || user?.firstName || 'Unknown User',
            userEmail: user?.email || null,
          };
        })
      );
      
      res.json(enrichedFeedback);
    } catch (error) {
      logger.error("Error fetching all feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  app.put("/api/admin/feedback/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminResponse } = req.body;
      const respondedBy = (req.user as any)?.claims?.sub;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      const updatedFeedback = await storage.updateFeedbackStatus(id, status, adminResponse, respondedBy);
      
      if (!updatedFeedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }
      
      res.json({ message: "Feedback updated successfully", feedback: updatedFeedback });
    } catch (error) {
      logger.error("Error updating feedback:", error);
      res.status(500).json({ message: "Failed to update feedback" });
    }
  });

  // Signup Promotion routes (Admin only)
  app.get("/api/signup-promotions", requireAdmin, async (req, res) => {
    try {
      const promotions = await storage.getAllSignupPromotions();
      res.json(promotions);
    } catch (error) {
      logger.error('Error fetching promotions:', error);
      res.status(500).json({ error: 'Failed to fetch promotions' });
    }
  });

  app.get("/api/signup-promotions/active", requireAdmin, async (req, res) => {
    try {
      const activePromotion = await storage.getActiveSignupPromotion();
      res.json(activePromotion);
    } catch (error) {
      logger.error('Error fetching active promotion:', error);
      res.status(500).json({ error: 'Failed to fetch active promotion' });
    }
  });

  app.post("/api/signup-promotions", requireAdmin, async (req, res) => {
    try {
      const result = insertSignupPromotionSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues });
      }

      const promotion = await storage.createSignupPromotion(result.data);
      res.status(201).json(promotion);
    } catch (error) {
      logger.error('Error creating promotion:', error);
      res.status(500).json({ error: 'Failed to create promotion' });
    }
  });

  app.put("/api/signup-promotions/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const result = insertSignupPromotionSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues });
      }

      const promotion = await storage.updateSignupPromotion(id, result.data);
      if (!promotion) {
        return res.status(404).json({ error: 'Promotion not found' });
      }

      res.json(promotion);
    } catch (error) {
      logger.error('Error updating promotion:', error);
      res.status(500).json({ error: 'Failed to update promotion' });
    }
  });

  app.delete("/api/signup-promotions/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteSignupPromotion(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Promotion not found' });
      }
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting promotion:', error);
      res.status(500).json({ error: 'Failed to delete promotion' });
    }
  });
}
