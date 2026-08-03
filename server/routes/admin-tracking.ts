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
import { sql } from "drizzle-orm";
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

import { type RouteContext, eq, and, clients } from "./context";

export function registerAdminTrackingRoutes(app: Express, ctx: RouteContext) {
  // Admin gating: see requireAdmin in server/middleware.ts

  // Admin route to add credits to any user
  app.post('/api/admin/add-credits', requireAdmin, async (req, res) => {
    try {
      const { userId, credits } = req.body;
      
      if (!userId || typeof credits !== 'number') {
        return res.status(400).json({ error: 'userId and credits (number) are required' });
      }
      
      if (credits < 0) {
        return res.status(400).json({ error: 'Credits amount must be positive' });
      }
      
      // Get current user to check if they exist
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Add credits to user's current balance
      const newBalance = (user.buzzCredits || 0) + credits;
      await storage.updateUserCredits(userId, newBalance);
      
      res.json({ 
        message: `Added ${credits} credits to ${user.username || user.email || userId}`,
        newBalance,
        addedCredits: credits
      });
    } catch (error) {
      logger.error('Failed to add credits:', error);
      res.status(500).json({ message: 'Failed to add credits' });
    }
  });

  // Admin route to airdrop buzz to all users
  app.post('/api/admin/airdrop-buzz', requireAdmin, async (req, res) => {
    try {
      const { amount, reason } = req.body;
      
      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }

      if (amount > 10000) {
        return res.status(400).json({ error: 'Amount cannot exceed 10,000 buzz per airdrop for safety' });
      }

      const result = await storage.airdropBuzzToAllUsers(amount, reason);
      
      res.json({ 
        success: true, 
        message: `Airdropped ${amount} buzz to ${result.usersAffected} users`,
        usersAffected: result.usersAffected,
        totalBuzzDistributed: result.totalBuzzDistributed,
        reason: reason || 'No reason specified'
      });
    } catch (error) {
      logger.error('Failed to airdrop buzz:', error);
      res.status(500).json({ error: 'Failed to airdrop buzz' });
    }
  });

  // Admin stats endpoint
  app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
      // Use efficient aggregation queries instead of loading all data
      const [totalUsers, totalGenerations, totalModels, activeUsers, totalCreditsConsumed, totalUpscales] = await Promise.all([
        storage.getUserCount(),
        storage.getGenerationCount(),
        storage.getModelCount(),
        storage.getActiveUserCount(30), // Users active in last 30 days
        storage.getTotalCreditsConsumed(),
        storage.getTotalUpscales()
      ]);
      
      const stats = {
        totalUsers,
        totalGenerations,
        totalModels,
        activeUsers,
        onlineUsers: clients.size, // Real-time count of connected WebSocket users
        creditsConsumed: totalCreditsConsumed,
        totalUpscales,
      };
      
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get admin stats:', error);
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  // User Tracking Endpoints
  
  // Start tracking a user
  app.post('/api/admin/tracking/start', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      const adminId = (req.user as any).claims.sub;
      
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      
      // Check if already tracking this user
      const existingSession = await storage.getActiveTrackingSession(userId);
      if (existingSession) {
        return res.status(400).json({ error: 'User is already being tracked' });
      }
      
      const session = await storage.startUserTracking(userId, adminId);
      logger.info(`📊 Admin ${adminId} started tracking user ${userId}`);
      
      res.json({ success: true, session });
    } catch (error) {
      logger.error('Failed to start tracking:', error);
      res.status(500).json({ error: 'Failed to start tracking' });
    }
  });
  
  // Stop tracking a user
  app.post('/api/admin/tracking/stop', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      
      const session = await storage.stopUserTracking(userId);
      if (!session) {
        return res.status(404).json({ error: 'No active tracking session found' });
      }
      
      logger.info(`📊 Tracking stopped for user ${userId}, session ${session.id}`);
      
      res.json({ success: true, sessionId: session.id });
    } catch (error) {
      logger.error('Failed to stop tracking:', error);
      res.status(500).json({ error: 'Failed to stop tracking' });
    }
  });
  
  // Get tracking status for a user
  app.get('/api/admin/tracking/status/:userId', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const session = await storage.getActiveTrackingSession(userId);
      
      res.json({ 
        isTracking: !!session,
        session: session || null 
      });
    } catch (error) {
      logger.error('Failed to get tracking status:', error);
      res.status(500).json({ error: 'Failed to get tracking status' });
    }
  });
  
  // Download tracking log as text file
  app.get('/api/admin/tracking/download/:sessionId', requireAdmin, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const data = await storage.getTrackingSessionWithEvents(sessionId);
      
      if (!data) {
        return res.status(404).json({ error: 'Tracking session not found' });
      }
      
      const { session, events } = data;
      
      // Get user info
      const user = await storage.getUser(session.trackedUserId);
      const adminUser = await storage.getUser(session.trackerAdminId);
      
      // Format as text
      const lines: string[] = [];
      lines.push('='.repeat(80));
      lines.push('USER ACTIVITY TRACKING LOG');
      lines.push('='.repeat(80));
      lines.push('');
      lines.push(`Tracked User: ${user?.username || 'Unknown'} (${user?.email || 'N/A'})`);
      lines.push(`Tracked By: ${adminUser?.username || 'Unknown'}`);
      lines.push(`Started: ${session.startedAt.toISOString()}`);
      lines.push(`Stopped: ${session.stoppedAt ? session.stoppedAt.toISOString() : 'Still tracking'}`);
      lines.push(`Total Events: ${events.length}`);
      lines.push('');
      lines.push('='.repeat(80));
      lines.push('ACTIVITY LOG');
      lines.push('='.repeat(80));
      lines.push('');
      
      for (const event of events) {
        const timestamp = event.timestamp.toISOString();
        lines.push(`[${timestamp}]`);
        lines.push(`  Page: ${event.page}`);
        lines.push(`  Action: ${event.action}`);
        if (event.details) {
          lines.push(`  Details: ${JSON.stringify(event.details, null, 2)}`);
        }
        lines.push('');
      }
      
      lines.push('='.repeat(80));
      lines.push('END OF LOG');
      lines.push('='.repeat(80));
      
      const textContent = lines.join('\n');
      const filename = `tracking-${user?.username || 'unknown'}-${sessionId}.txt`;
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(textContent);
    } catch (error) {
      logger.error('Failed to download tracking log:', error);
      res.status(500).json({ error: 'Failed to download tracking log' });
    }
  });
  
  // ── Model Performance Leaderboard ────────────────────────────────────────────
  // Returns per-model median/P90 queue and generate latency from passively-
  // recorded timing data.  Only includes generations that have timing data
  // (queue_ms IS NOT NULL), so results grow automatically over time.
  app.get('/api/admin/model-performance', requireAdmin, async (req, res) => {
    try {
      // Only rows with timing data are included — success% is intentionally omitted
      // because timing is currently recorded only on success, so including a
      // successCount/totalCount here would give a misleadingly perfect 100% rate.
      // Task #52 tracks extending timing to failures so the metric can be added later.
      const rows = await db.execute(sql`
        SELECT
          m.id                                                                          AS "modelId",
          m.name                                                                        AS "modelName",
          m.base_model                                                                  AS "baseModel",
          COUNT(*)                                                                      AS "timedCount",
          COUNT(*) FILTER (WHERE g.created_at > NOW() - INTERVAL '24 hours')           AS "count24h",
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.queue_ms))::int          AS "medianQueueMs",
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY g.queue_ms))::int          AS "p90QueueMs",
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.generate_ms))::int       AS "medianGenerateMs",
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY COALESCE(g.queue_ms, 0) + COALESCE(g.generate_ms, 0)
          ))::int                                                                       AS "medianTotalMs",
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (
            ORDER BY COALESCE(g.queue_ms, 0) + COALESCE(g.generate_ms, 0)
          ))::int                                                                       AS "p90TotalMs"
        FROM generations g
        JOIN models m ON g.model_id = m.id
        WHERE g.queue_ms IS NOT NULL
        GROUP BY m.id, m.name, m.base_model
        ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY COALESCE(g.queue_ms, 0) + COALESCE(g.generate_ms, 0)
        ) ASC NULLS LAST
      `);
      res.json({ models: rows.rows });
    } catch (error) {
      logger.error('Failed to fetch model performance:', error);
      res.status(500).json({ error: 'Failed to fetch model performance data' });
    }
  });

  // Record tracking event (called by client when user is being tracked)
  app.post('/api/tracking/event', isAuthenticated, async (req, res) => {
    try {
      // SECURITY: Get user ID from authenticated session, never trust client payload
      const userId = (req.user as any).claims.sub;
      const { page, action, details } = req.body;
      
      // Validate input
      if (!page || typeof page !== 'string' || page.length > 500) {
        return res.json({ success: true, tracked: false });
      }
      if (!action || typeof action !== 'string' || action.length > 200) {
        return res.json({ success: true, tracked: false });
      }
      
      // Check if THIS authenticated user is being tracked
      const session = await storage.getActiveTrackingSession(userId);
      if (!session) {
        // Not being tracked, silently ignore
        return res.json({ success: true, tracked: false });
      }
      
      // SECURITY: Verify session is active and belongs to the authenticated user
      if (!session.isActive || session.trackedUserId !== userId) {
        return res.json({ success: true, tracked: false });
      }
      
      // Sanitize details object to prevent injection attacks
      const sanitizedDetails = details ? JSON.parse(JSON.stringify(details)) : undefined;
      
      // Record the event
      await storage.addTrackingEvent(session.id, page, action, sanitizedDetails);
      
      res.json({ success: true, tracked: true });
    } catch (error) {
      logger.error('Failed to record tracking event:', error);
      // Don't fail the client request even if tracking fails
      res.json({ success: true, tracked: false });
    }
  });

}
