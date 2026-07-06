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

export function registerSanitizationRoutes(app: Express, ctx: RouteContext) {
  // Public endpoint for sanitization rules (for generation preview) - requires authentication but not admin
  app.get('/api/sanitization-rules/active', async (req: any, res) => {
    try {
      // Get only enabled rules for generation preview
      const rules = await storage.getEnabledSanitizationRules();
      res.json(rules);
    } catch (error) {
      logger.error('Error fetching active sanitization rules:', error);
      res.status(500).json({ message: 'Failed to fetch active sanitization rules' });
    }
  });

  // Sanitization Rules Admin Endpoints
  app.get('/api/admin/sanitization-rules', requireAdmin, async (req, res) => {
    try {
      const { ruleType } = req.query;
      const rules = await storage.getSanitizationRules(ruleType as string | undefined);
      res.json(rules);
    } catch (error) {
      logger.error('Error fetching sanitization rules:', error);
      res.status(500).json({ message: 'Failed to fetch sanitization rules' });
    }
  });

  app.post('/api/admin/sanitization-rules', requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const { ruleType, pattern, replacement, isEnabled, isSystemRule, description } = req.body;
      
      if (!ruleType || !pattern) {
        return res.status(400).json({ message: 'ruleType and pattern are required' });
      }
      
      const validTypes = ['positive_remove', 'positive_replace', 'negative_add', 'negative_block'];
      if (!validTypes.includes(ruleType)) {
        return res.status(400).json({ message: 'Invalid ruleType. Must be one of: ' + validTypes.join(', ') });
      }
      
      const rule = await storage.createSanitizationRule({
        ruleType,
        pattern,
        replacement: replacement || null,
        isEnabled: isEnabled !== false,
        isSystemRule: isSystemRule || false,
        description: description || null,
        createdBy: adminId,
      });
      
      res.status(201).json(rule);
    } catch (error) {
      logger.error('Error creating sanitization rule:', error);
      res.status(500).json({ message: 'Failed to create sanitization rule' });
    }
  });

  app.patch('/api/admin/sanitization-rules/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Check if rule exists and is not a system rule (system rules can only be enabled/disabled)
      const existingRule = await storage.getSanitizationRule(id);
      if (!existingRule) {
        return res.status(404).json({ message: 'Sanitization rule not found' });
      }
      
      // System rules can only have isEnabled toggled
      if (existingRule.isSystemRule) {
        const allowedUpdates: any = {};
        if (typeof updates.isEnabled === 'boolean') {
          allowedUpdates.isEnabled = updates.isEnabled;
        }
        if (Object.keys(allowedUpdates).length === 0) {
          return res.status(400).json({ message: 'System rules can only have isEnabled toggled' });
        }
        const updated = await storage.updateSanitizationRule(id, allowedUpdates);
        return res.json(updated);
      }
      
      const updated = await storage.updateSanitizationRule(id, updates);
      res.json(updated);
    } catch (error) {
      logger.error('Error updating sanitization rule:', error);
      res.status(500).json({ message: 'Failed to update sanitization rule' });
    }
  });

  app.delete('/api/admin/sanitization-rules/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if rule exists and is not a system rule
      const existingRule = await storage.getSanitizationRule(id);
      if (!existingRule) {
        return res.status(404).json({ message: 'Sanitization rule not found' });
      }
      
      if (existingRule.isSystemRule) {
        return res.status(403).json({ message: 'Cannot delete system rules. You can only disable them.' });
      }
      
      const deleted = await storage.deleteSanitizationRule(id);
      if (deleted) {
        res.json({ message: 'Sanitization rule deleted successfully' });
      } else {
        res.status(404).json({ message: 'Sanitization rule not found' });
      }
    } catch (error) {
      logger.error('Error deleting sanitization rule:', error);
      res.status(500).json({ message: 'Failed to delete sanitization rule' });
    }
  });

}
