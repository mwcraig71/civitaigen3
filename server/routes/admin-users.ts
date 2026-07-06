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

export function registerAdminUsersRoutes(app: Express, ctx: RouteContext) {
  // Admin User Management Routes
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const sortBy = (req.query.sortBy as 'lastActiveAt' | 'alphabetical' | 'createdAt') || 'createdAt';
      const search = (req.query.search as string) || '';
      
      // Get all users without pagination limit
      const result = await storage.getAllUsersForAdmin({
        page: 1,
        limit: 10000, // Effectively unlimited
        sortBy,
        search
      });
      
      res.json(result);
    } catch (error) {
      logger.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:userId/lock", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = (req.user as any)?.claims?.sub;
      
      if (!reason) {
        return res.status(400).json({ message: "Lock reason is required" });
      }
      
      const lockedUser = await storage.lockUser(userId, adminId, reason);
      
      if (!lockedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create notification for locked user
      try {
        await storage.createNotification({
          userId: userId,
          type: 'admin_action',
          title: 'Account Suspended',
          message: `Your account has been suspended by an administrator. Reason: ${reason}. If you believe this is an error, please contact support.`,
          actionUrl: '/contact',
          actionText: 'Contact Support'
        });
      } catch (error) {
        logger.error("Error creating lock notification:", error);
        // Don't fail the lock operation if notification fails
      }
      
      res.json({ message: "User locked successfully", user: lockedUser });
    } catch (error) {
      logger.error("Error locking user:", error);
      res.status(500).json({ message: "Failed to lock user" });
    }
  });

  app.post("/api/admin/users/:userId/unlock", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const unlockedUser = await storage.unlockUser(userId);
      
      if (!unlockedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create notification for unlocked user
      try {
        await storage.createNotification({
          userId: userId,
          type: 'admin_action',
          title: 'Account Restored',
          message: 'Your account has been restored by an administrator. You can now use all features normally.',
          actionUrl: '/',
          actionText: 'Continue Using App'
        });
      } catch (error) {
        logger.error("Error creating unlock notification:", error);
        // Don't fail the unlock operation if notification fails
      }
      
      res.json({ message: "User unlocked successfully", user: unlockedUser });
    } catch (error) {
      logger.error("Error unlocking user:", error);
      res.status(500).json({ message: "Failed to unlock user" });
    }
  });

  app.delete("/api/admin/users/:userId", requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminUserId = req.user.claims.sub;
      
      // Get user info before deletion
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent deleting admin users
      if (user.isAdmin) {
        return res.status(403).json({ message: "Cannot delete admin users" });
      }
      
      // Record the user deletion in moderation logs
      await storage.recordModerationAction({
        userId: userId,
        generationId: '', // No specific generation for user deletion
        action: 'user_deleted',
        reason: reason || 'Account deletion by admin',
        adminId: adminUserId,
        timestamp: new Date()
      });
      
      // Create notification for user about account deletion (if they can still access it)
      try {
        await storage.createNotification({
          userId: userId,
          type: 'moderation',
          title: 'Account Deleted',
          message: `Your account has been deleted by an administrator. Reason: ${reason || 'Terms of service violation'}`,
          actionUrl: '/',
          actionText: 'View Details'
        });
      } catch (notificationError) {
        logger.error("Failed to create deletion notification:", notificationError);
      }
      
      // Delete the user (this automatically adds email to banned list)
      await storage.adminDeleteUser(userId);
      
      // Update banned email record with admin who performed the action
      if (user.email) {
        await storage.banEmail(user.email, reason || 'User account deleted by admin', adminUserId);
      }
      
      logger.info(`🔨 Admin ${adminUserId} deleted user ${user.username} (${userId}) and banned email: ${reason || 'No reason provided'}`);
      
      res.json({ 
        message: "User deleted successfully and email banned from re-registration",
        user: { username: user.username, id: user.id, email: user.email }
      });
    } catch (error) {
      logger.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Admin delete character endpoint
  app.delete("/api/admin/characters/:id", requireAdmin, async (req: any, res) => {
    try {
      const characterId = req.params.id;
      const deleted = await storage.deleteCharacterAsAdmin(characterId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Character not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting character as admin:", error);
      res.status(500).json({ error: "Failed to delete character" });
    }
  });

  // Admin endpoint to get images for a specific character
  app.get("/api/admin/characters/:id/images", requireAdmin, async (req: any, res) => {
    try {
      const characterId = req.params.id;
      const images = await storage.getImagesForCharacter(characterId);
      res.json({ images });
    } catch (error) {
      logger.error("Error fetching character images:", error);
      res.status(500).json({ error: "Failed to fetch character images" });
    }
  });

  // Get moderation logs
  app.get("/api/admin/moderation-logs", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getModerationLogs();
      res.json(logs);
    } catch (error) {
      logger.error("Failed to get moderation logs:", error);
      res.status(500).json({ error: "Failed to fetch moderation logs" });
    }
  });


  // Download moderation logs as CSV
  app.get("/api/admin/moderation-logs/download", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getModerationLogs();
      
      // Create CSV content
      const csvHeader = "ID,Action,Content Type,Content ID,Moderator ID,Reason,Previous Status,New Status,Created At\n";
      const csvRows = logs.map(log => {
        const fields = [
          log.id || '',
          log.action || '',
          log.contentType || '',
          log.contentId || '',
          log.moderatorId || '',
          (log.reason || '').replace(/"/g, '""'), // Escape quotes for CSV
          log.previousStatus || '',
          log.newStatus || '',
          log.createdAt ? new Date(log.createdAt).toISOString() : ''
        ];
        return '"' + fields.join('","') + '"';
      }).join('\n');
      
      const csvContent = csvHeader + csvRows;
      
      // Set headers for file download
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const filename = `moderation-logs-${timestamp}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      logger.error("Error downloading moderation logs:", error);
      res.status(500).json({ message: "Failed to download moderation logs" });
    }
  });

  // Get moderation logs for specific user
  app.get("/api/admin/moderation-logs/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const logs = await storage.getUserModerationLogs(userId);
      res.json(logs);
    } catch (error) {
      logger.error("Failed to get user moderation logs:", error);
      res.status(500).json({ error: "Failed to fetch user moderation logs" });
    }
  });

  // Platform Settings Routes
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllPlatformSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/admin/settings/:key", requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;
      const adminId = (req.user as any)?.claims?.sub;
      
      if (!value) {
        return res.status(400).json({ message: "Setting value is required" });
      }
      
      const setting = await storage.updatePlatformSetting(key, value, adminId, description);
      
      res.json({ message: "Setting updated successfully", setting });
    } catch (error) {
      logger.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

}
