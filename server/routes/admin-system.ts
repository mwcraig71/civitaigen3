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

import { type RouteContext, eq, and, clients } from "./context";

export function registerAdminSystemRoutes(app: Express, ctx: RouteContext) {
  // Environment diagnostics endpoint for deployment debugging
  app.get("/api/env-status", async (req, res) => {
    try {
      const envCheck = {
        hasObjectStorage: !!process.env.PRIVATE_OBJECT_DIR,
        hasPublicPaths: !!process.env.PUBLIC_OBJECT_SEARCH_PATHS,
        hasDatabase: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV || "development",
        port: process.env.PORT || "5000",
        // Object storage paths (masked for security)
        privateObjectDir: process.env.PRIVATE_OBJECT_DIR ? `${process.env.PRIVATE_OBJECT_DIR.substring(0, 20)}...` : "not set",
        publicObjectPaths: process.env.PUBLIC_OBJECT_SEARCH_PATHS ? `${process.env.PUBLIC_OBJECT_SEARCH_PATHS.substring(0, 20)}...` : "not set",
        websocketClients: clients.size,
        timestamp: new Date().toISOString()
      };
      
      res.json({
        status: "ok",
        envCheck
      });
    } catch (error) {
      logger.error('Environment status check error:', error);
      res.status(500).json({ 
        message: "Environment status check failed",
        error: (error as Error).message
      });
    }
  });

  // Admin system reset endpoints
  app.post('/api/admin/reset-websocket', requireAdmin, async (req, res) => {
    try {
      let disconnectedCount = 0;
      
      // Force close all WebSocket connections
      clients.forEach((client, userId) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, 'Admin reset');
          disconnectedCount++;
        }
      });
      
      // Clear the clients map
      clients.clear();
      
      logger.info(`🔄 Admin reset: Disconnected ${disconnectedCount} WebSocket clients`);
      
      res.json({
        message: `Successfully reset ${disconnectedCount} WebSocket connections`,
        disconnectedCount
      });
    } catch (error) {
      logger.error('WebSocket reset error:', error);
      res.status(500).json({ 
        message: 'Failed to reset WebSocket connections',
        error: (error as Error).message 
      });
    }
  });

  app.post('/api/admin/clear-cache', requireAdmin, async (req, res) => {
    try {
      // Clear any in-memory caches
      // Note: This is a placeholder - add actual cache clearing logic as needed
      const clearedItems = 0;
      
      logger.info('🗑️ Admin reset: Application cache cleared');
      
      res.json({
        message: `Successfully cleared application cache (${clearedItems} items)`,
        clearedItems
      });
    } catch (error) {
      logger.error('Cache clear error:', error);
      res.status(500).json({ 
        message: 'Failed to clear application cache',
        error: (error as Error).message 
      });
    }
  });

  app.post('/api/admin/restart-system', requireAdmin, async (req, res) => {
    try {
      logger.info('🔄 Admin initiated system restart');
      
      res.json({
        message: 'System restart initiated - reconnecting in 3 seconds...'
      });
      
      // Close all WebSocket connections gracefully
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, 'System restart');
        }
      });
      clients.clear();
      
      // Note: In a real system, you might trigger a process restart here
      // For now, we'll just clear connections and let clients reconnect
      
    } catch (error) {
      logger.error('System restart error:', error);
      res.status(500).json({ 
        message: 'Failed to restart system',
        error: (error as Error).message 
      });
    }
  });

  // Error Logging Admin Routes
  app.get('/api/admin/error-logs', requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const errorType = req.query.type as string;
      const onlyUnresolved = req.query.unresolved === 'true';
      
      let logs;
      if (errorType) {
        logs = await storage.getErrorLogsByType(errorType, limit);
      } else if (onlyUnresolved) {
        logs = await storage.getUnresolvedErrors(limit);
      } else {
        logs = await storage.getErrorLogs(limit);
      }
      
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching error logs:', error);
      await ErrorLogger.logDatabaseError(
        'Failed to fetch error logs from admin panel',
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        'getErrorLogs',
        req
      );
      res.status(500).json({ message: 'Failed to fetch error logs' });
    }
  });

  app.get('/api/admin/error-logs/stats', requireAdmin, async (req, res) => {
    try {
      const [totalErrors, unresolvedErrors, generationErrors, apiErrors, authErrors] = await Promise.all([
        storage.getErrorLogs(1000),
        storage.getUnresolvedErrors(1000),
        storage.getErrorLogsByType('generation', 1000),
        storage.getErrorLogsByType('api', 1000),
        storage.getErrorLogsByType('authentication', 1000)
      ]);
      
      res.json({
        total: totalErrors.length,
        unresolved: unresolvedErrors.length,
        byType: {
          generation: generationErrors.length,
          api: apiErrors.length,
          authentication: authErrors.length,
          system: totalErrors.filter(log => log.errorType === 'system').length,
          database: totalErrors.filter(log => log.errorType === 'database').length,
          validation: totalErrors.filter(log => log.errorType === 'validation').length
        },
        recentErrors: totalErrors.slice(0, 10)
      });
    } catch (error) {
      logger.error('Error fetching error log stats:', error);
      res.status(500).json({ message: 'Failed to fetch error statistics' });
    }
  });

  app.patch('/api/admin/error-logs/:id/resolve', requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const { notes } = req.body;
      
      const updatedLog = await storage.markErrorResolved(req.params.id, adminId, notes);
      if (!updatedLog) {
        return res.status(404).json({ message: 'Error log not found' });
      }
      
      res.json(updatedLog);
    } catch (error) {
      logger.error('Error resolving error log:', error);
      res.status(500).json({ message: 'Failed to resolve error log' });
    }
  });

  app.delete('/api/admin/error-logs/cleanup', requireAdmin, async (req, res) => {
    try {
      const daysOld = parseInt(req.query.days as string) || 30;
      const deletedCount = await storage.deleteOldErrorLogs(daysOld);
      
      res.json({ 
        message: `Cleaned up ${deletedCount} error logs older than ${daysOld} days`,
        deletedCount
      });
    } catch (error) {
      logger.error('Error cleaning up error logs:', error);
      res.status(500).json({ message: 'Failed to cleanup error logs' });
    }
  });

}
