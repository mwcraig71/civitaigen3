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

export function registerPushRewardsRoutes(app: Express, ctx: RouteContext) {
  // Admin middleware to check admin permissions
  // ---- Web push ----
  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: getVapidPublicKey() || null, enabled: pushEnabled });
  });

  app.post('/api/push/subscribe', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { endpoint, keys } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: 'Invalid subscription payload' });
      }
      await saveSubscription(userId, { endpoint, keys });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error saving push subscription:', error);
      res.status(500).json({ message: 'Failed to save subscription' });
    }
  });

  app.post('/api/push/unsubscribe', isAuthenticated, async (req: any, res) => {
    try {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ message: 'endpoint required' });
      await removeSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error removing push subscription:', error);
      res.status(500).json({ message: 'Failed to remove subscription' });
    }
  });

  // ---- Daily reward / streak ----
  app.get('/api/rewards/daily-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const status = await storage.getDailyRewardStatus(userId);
      res.json(status);
    } catch (error) {
      logger.error('Error fetching daily reward status:', error);
      res.status(500).json({ message: 'Failed to fetch daily reward status' });
    }
  });

  app.post('/api/rewards/daily-claim', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const result = await storage.claimDailyReward(userId);
      if (!result.claimed) {
        return res.status(409).json({ message: 'Already claimed today', streak: result.streak });
      }
      res.json(result);
    } catch (error) {
      logger.error('Error claiming daily reward:', error);
      res.status(500).json({ message: 'Failed to claim daily reward' });
    }
  });

  // ---- Referral program ----
  app.get('/api/referral', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { code, referralCount } = await storage.getOrCreateReferralCode(userId);
      res.json({ code, referralCount });
    } catch (error) {
      logger.error('Error fetching referral code:', error);
      res.status(500).json({ message: 'Failed to fetch referral code' });
    }
  });

  app.post('/api/referral/redeem', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!code.trim()) return res.status(400).json({ message: 'Referral code is required' });
      const result = await storage.redeemReferralCode(userId, code);
      if (!result.ok) return res.status(400).json({ message: result.error });
      res.json({ success: true, reward: result.reward });
    } catch (error) {
      logger.error('Error redeeming referral code:', error);
      res.status(500).json({ message: 'Failed to redeem referral code' });
    }
  });

}
