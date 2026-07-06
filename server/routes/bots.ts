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

export function registerBotsRoutes(app: Express, ctx: RouteContext) {
  // Admin: Create bot account and API key
  app.post("/api/admin/create-bot-account", requireAdmin, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await storage.getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const { botName, credits, dailyLimit, password } = req.body;
      const name = botName || "AI Bot";
      const botCredits = credits || 10000;
      const limit = dailyLimit || 1200;

      const botId = `bot_${Date.now()}`;
      const botUsername = name.toLowerCase().replace(/\s+/g, '_');
      const botUser = await storage.createUser({
        id: botId,
        username: botUsername,
        email: `${botUsername}@bot.civiverse.app`,
        displayName: name,
      });

      if (password) {
        const hashedPw = await hashBotPassword(password);
        await storage.updateUser(botId, { botPassword: hashedPw });
      }

      await storage.updateUserCredits(botId, botCredits);

      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 10) + "...";

      const apiKey = await storage.createApiKey(botId, `${name} API Key`, keyHash, keyPrefix, limit);

      logger.info(`🤖 Bot account created: ${name} (${botId}) with ${botCredits} credits and ${limit}/day rate limit`);

      res.json({
        bot: {
          id: botId,
          username: botUser.username,
          credits: botCredits,
          hasPassword: !!password,
        },
        apiKey: {
          id: apiKey.id,
          key: rawKey,
          keyPrefix: apiKey.keyPrefix,
          dailyLimit: limit,
          message: "Save this key securely - it won't be shown again!",
        },
        login: password ? {
          endpoint: "/api/v1/login",
          username: botUser.username,
          message: "Bot can login with POST /api/v1/login using {username, password}",
        } : undefined,
      });
    } catch (error) {
      logger.error("Error creating bot account:", error);
      res.status(500).json({ error: "Failed to create bot account" });
    }
  });

  // Admin: List bot accounts
  app.get("/api/admin/bot-accounts", requireAdmin, async (req: any, res) => {
    try {
      const adminUserId = (req.user as any)?.claims?.sub;
      if (!adminUserId) return res.status(401).json({ error: "Authentication required" });
      const adminUser = await storage.getUser(adminUserId);
      if (!adminUser?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const allUsers = await storage.getAllUsers();
      const bots = allUsers
        .filter(u => u.id.startsWith('bot_') || u.botPassword)
        .map(u => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          email: u.email,
          credits: u.buzzCredits || 0,
          totalGenerations: u.totalGenerated || 0,
          createdAt: u.createdAt,
        }));

      res.json({ bots });
    } catch (error) {
      logger.error("Error listing bot accounts:", error);
      res.status(500).json({ error: "Failed to list bot accounts" });
    }
  });

  // Admin: Impersonate a user (start viewing the app as that user)
  app.post("/api/admin/impersonate/:userId", requireAdmin, async (req: any, res) => {
    try {
      const adminUserId = (req.user as any)?.claims?.sub;
      if (!adminUserId) return res.status(401).json({ error: "Authentication required" });

      const adminUser = await storage.getUser(adminUserId);
      if (!adminUser?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const targetUserId = req.params.userId;
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const originalUser = { ...req.user };

      const impersonatedUser = {
        claims: {
          sub: targetUser.id,
          email: targetUser.email || '',
          first_name: targetUser.displayName || targetUser.username || 'User',
          last_name: '',
          profile_image_url: null
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
        _impersonation: {
          originalUser,
          adminUserId: adminUserId,
          adminUsername: adminUser.username,
        }
      };

      req.login(impersonatedUser, (err: any) => {
        if (err) {
          logger.error('Impersonation login error:', err);
          return res.status(500).json({ error: "Failed to impersonate user" });
        }

        logger.info(`👤 Admin ${adminUser.username} is now impersonating ${targetUser.username || targetUser.id}`);
        res.json({
          success: true,
          impersonating: {
            id: targetUser.id,
            username: targetUser.username,
            displayName: targetUser.displayName,
            credits: targetUser.buzzCredits,
          },
        });
      });
    } catch (error) {
      logger.error("Error impersonating user:", error);
      res.status(500).json({ error: "Failed to impersonate user" });
    }
  });

  // Admin: Stop impersonation and restore original admin session
  app.post("/api/admin/stop-impersonate", isAuthenticated, async (req: any, res) => {
    try {
      const impersonation = (req.user as any)?._impersonation;
      if (!impersonation) {
        return res.status(400).json({ error: "Not currently impersonating anyone" });
      }

      const originalUser = impersonation.originalUser;
      req.login(originalUser, (err: any) => {
        if (err) {
          logger.error('Stop impersonation error:', err);
          return res.status(500).json({ error: "Failed to restore admin session" });
        }

        logger.info(`👤 Admin ${impersonation.adminUsername} stopped impersonating`);
        res.json({ success: true });
      });
    } catch (error) {
      logger.error("Error stopping impersonation:", error);
      res.status(500).json({ error: "Failed to stop impersonation" });
    }
  });

  // Check impersonation status
  app.get("/api/admin/impersonation-status", isAuthenticated, async (req: any, res) => {
    const impersonation = (req.user as any)?._impersonation;
    if (impersonation) {
      const userId = (req.user as any)?.claims?.sub;
      const targetUser = await storage.getUser(userId);
      res.json({
        isImpersonating: true,
        adminUsername: impersonation.adminUsername,
        targetUser: {
          id: targetUser?.id,
          username: targetUser?.username,
          displayName: targetUser?.displayName,
        },
      });
    } else {
      res.json({ isImpersonating: false });
    }
  });
}
