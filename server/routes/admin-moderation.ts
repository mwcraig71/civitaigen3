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
import { responseCache } from "../cache";
import { getCleanupStats, runImageCleanup, RETENTION_POLICY } from "../image-cleanup-service";
import OpenAI from "openai";
import { apiV1Router, generateApiKey, hashApiKey, hashBotPassword, setGenerateImageHandler, setBatchTracker, setSubmitTransformHandler } from "../api-v1";

import { type RouteContext, eq, and, convertGenerationsForResponse, clients } from "./context";

export function registerAdminModerationRoutes(app: Express, ctx: RouteContext) {
  // Admin online users endpoint
  app.get('/api/admin/online-users', requireAdmin, async (req, res) => {
    try {
      const onlineUserIds = Array.from(clients.keys()).filter(id => id !== 'anonymous');
      
      // Only fetch specific online users instead of all users
      const onlineUsers = await Promise.all(
        onlineUserIds.map(async userId => {
          const user = await storage.getUser(userId);
          return user ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            isAdmin: user.isAdmin,
            lastActiveAt: user.lastActiveAt
          } : {
            id: userId,
            username: 'Unknown',
            displayName: null,
            email: null,
            isAdmin: false,
            lastActiveAt: new Date()
          };
        })
      );
      
      res.json({
        onlineUsers,
        count: onlineUsers.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get online users:', error);
      res.status(500).json({ error: 'Failed to fetch online users' });
    }
  });

  // Admin users endpoint with sorting - MOVED to line ~7400 with full sorting support

  // Check admin permissions endpoint
  app.get('/api/admin/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      res.json({ 
        isAdmin: !!user?.isAdmin,
        user: user ? {
          id: user.id,
          username: user.username,
          email: user.email
        } : null
      });
    } catch (error) {
      logger.error('Failed to check admin status:', error);
      res.status(500).json({ error: 'Failed to check admin status' });
    }
  });

  // Admin CSV export endpoint for user emails and notification preferences
  app.get('/api/admin/export-users-csv', requireAdmin, async (req, res) => {
    try {
      const allUsersResult = await storage.getAllUsersForAdmin();
      const allUsers = allUsersResult.users;
      
      // Create CSV header
      const csvHeader = 'Email,Username,Display Name,Email Notifications Opted In,Registration Date,Last Login,Credits,Admin,Verified,Supporter\n';
      
      // Convert users to CSV rows with proper escaping and CSV injection protection
      const csvRows = allUsers.map(user => {
        // Helper function to safely escape CSV values and prevent injection
        const safeCsvValue = (value: string | null | undefined): string => {
          if (!value) return '';
          let escaped = String(value);
          
          // Prevent CSV injection by prefixing dangerous characters with single quote
          // Check for dangerous characters even after leading whitespace/control chars
          if (escaped.match(/^[\s\u0000-\u001F]*[=+\-@]/)) {
            escaped = "'" + escaped;
          }
          
          // Escape quotes and wrap in quotes if needed
          escaped = escaped.replace(/"/g, '""');
          
          // Always wrap in quotes for consistency and safety
          return `"${escaped}"`;
        };
        
        const email = safeCsvValue(user.email);
        const username = safeCsvValue(user.username);
        const displayName = safeCsvValue(user.displayName);
        const emailOptIn = safeCsvValue(user.emailNotifications ? 'Yes' : 'No');
        const registrationDate = safeCsvValue(user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : '');
        const lastLogin = safeCsvValue(user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().split('T')[0] : '');
        const credits = safeCsvValue(String(user.buzzCredits || 0)); // Convert to string and sanitize
        const isAdmin = safeCsvValue(user.isAdmin ? 'Yes' : 'No');
        const isVerified = safeCsvValue(user.isVerified ? 'Yes' : 'No');
        const isSupporter = safeCsvValue(user.isSupporter ? 'Yes' : 'No');
        
        return `${email},${username},${displayName},${emailOptIn},${registrationDate},${lastLogin},${credits},${isAdmin},${isVerified},${isSupporter}`;
      }).join('\r\n'); // Use CRLF for better Excel compatibility
      
      const csvContent = csvHeader + csvRows;
      
      // Set headers for CSV download with UTF-8 encoding
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.csv"`);
      
      // Add UTF-8 BOM for proper encoding in Excel
      const csvWithBOM = '\uFEFF' + csvContent;
      
      logger.info(`📊 Admin exported ${allUsers.length} users to CSV`);
      res.send(csvWithBOM);
    } catch (error) {
      logger.error("Error exporting users CSV:", error);
      res.status(500).json({ message: "Failed to export users CSV" });
    }
  });

  // Admin recent generations endpoint for activity log (500 latest)
  app.get('/api/admin/generations/recent', requireAdmin, async (req, res) => {
    try {
      // Get latest 500 generations for recent activity log
      const generationsWithUsers = await storage.getPaginatedCompletedGenerations(500, 0);
      const convertedGenerations = convertGenerationsForResponse(generationsWithUsers);
      
      res.json(convertedGenerations);
    } catch (error) {
      logger.error('Error fetching recent admin generations:', error);
      res.status(500).json({ error: 'Failed to fetch recent generations' });
    }
  });

  // Admin generations endpoint with efficient database pagination
  app.get('/api/admin/generations', requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 80;
      const offset = (page - 1) * limit;
      const usernameFilter = req.query.username as string;
      const userIdFilter = req.query.userId as string;
      
      // Use efficient database query instead of loading all data
      const generationsWithUsers = await storage.getPaginatedCompletedGenerations(limit, offset, usernameFilter, userIdFilter);
      const totalCompletedGenerations = await storage.getCompletedGenerationCount(usernameFilter, userIdFilter);
      
      const convertedGenerations = convertGenerationsForResponse(generationsWithUsers);
      
      res.json({
        generations: convertedGenerations,
        total: totalCompletedGenerations,
        page,
        limit,
        hasMore: offset + limit < totalCompletedGenerations
      });
    } catch (error) {
      logger.error('Failed to get generations:', error);
      res.status(500).json({ error: 'Failed to fetch generations' });
    }
  });

  // Admin models endpoint
  app.get('/api/admin/models', requireAdmin, async (req, res) => {
    try {
      const models = await storage.getAllModels();
      res.json(models);
    } catch (error) {
      logger.error('Failed to get models:', error);
      res.status(500).json({ error: 'Failed to fetch models' });
    }
  });

  // Admin update model — allows admins to set loraCategory and other model fields
  app.patch('/api/admin/models/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { loraCategory, generationAllowed } = req.body;

      // Validate loraCategory if provided
      if (loraCategory !== undefined && loraCategory !== null && loraCategory !== 'character' && loraCategory !== 'style') {
        return res.status(400).json({ error: 'loraCategory must be "character", "style", or null' });
      }

      const updates: Record<string, any> = { loraCategory: loraCategory ?? null };
      if (generationAllowed !== undefined) {
        if (typeof generationAllowed !== 'boolean') {
          return res.status(400).json({ error: 'generationAllowed must be a boolean' });
        }
        updates.generationAllowed = generationAllowed;
      }
      const updated = await storage.updateModel(id, updates);
      if (!updated) {
        return res.status(404).json({ error: 'Model not found' });
      }
      // Bust the 12-hour server-side model cache so the change is visible immediately
      responseCache.invalidate('/api/models');
      responseCache.invalidate('/api/models/popular');
      responseCache.invalidate('/api/models?generationAllowed=true');
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update model:', error);
      res.status(500).json({ error: 'Failed to update model' });
    }
  });

  // Get image cleanup stats (preview what will be deleted)
  app.get('/api/admin/cleanup/stats', requireAdmin, async (req, res) => {
    try {
      const stats = await getCleanupStats();
      res.json({
        ...stats,
        retentionPolicy: RETENTION_POLICY,
      });
    } catch (error) {
      logger.error('Failed to get cleanup stats:', error);
      res.status(500).json({ error: 'Failed to get cleanup stats' });
    }
  });

  // Run image cleanup (with optional dry-run mode)
  app.post('/api/admin/cleanup/run', requireAdmin, async (req, res) => {
    try {
      const dryRun = req.body.dryRun !== false;
      logger.info(`🧹 Admin triggered image cleanup (dryRun: ${dryRun})`);
      
      const result = await runImageCleanup(dryRun);
      res.json(result);
    } catch (error) {
      logger.error('Failed to run cleanup:', error);
      res.status(500).json({ error: 'Failed to run cleanup' });
    }
  });

  // Get retention policy info (public endpoint for documentation)
  app.get('/api/retention-policy', (req, res) => {
    res.json({
      sharedImageRetentionDays: RETENTION_POLICY.sharedImagesDays,
      privateGenerationRetentionDays: RETENTION_POLICY.privateGenerationsDays,
      description: RETENTION_POLICY.description,
    });
  });

  // Admin update generation content rating
  app.patch('/api/admin/generations/:id/rating', requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { contentRating } = req.body;
      
      // Validate content rating
      const validRatings = ['unrated', 'pg', 'r'];
      if (!validRatings.includes(contentRating)) {
        return res.status(400).json({ message: `Invalid content rating. Must be one of: ${validRatings.join(', ')}` });
      }
      
      // Get the generation
      const generation = await storage.getGeneration(id);
      if (!generation) {
        return res.status(404).json({ message: 'Generation not found' });
      }
      
      // Update the generation's content rating
      await storage.updateGeneration(id, { contentRating });
      
      res.json({ 
        success: true,
        message: 'Content rating updated successfully',
        generationId: id,
        contentRating
      });
    } catch (error) {
      logger.error('Error updating content rating:', error);
      res.status(500).json({ message: 'Failed to update content rating' });
    }
  });

  // Admin delete generation with TOS notification
  app.delete('/api/admin/generations/:id', requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminUserId = req.user.claims.sub; // Get the authenticated admin's user ID
      
      const result = await storage.deleteGenerationAsAdmin(id, adminUserId, reason);
      
      // TODO: Implement actual user notification system
      // For now, just log the notification
      if (result.user) {
        logger.info(`📧 TOS Notification would be sent to ${result.user.email}:`, {
          subject: 'Content Removed - Terms of Service Violation',
          message: `Your generated image has been removed for violating our terms of service. Reason: ${reason || 'Terms of service violation'}`
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Generation deleted successfully',
        user: result.user ? {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email
        } : null
      });
    } catch (error) {
      logger.error('Failed to delete generation:', error);
      res.status(500).json({ error: 'Failed to delete generation' });
    }
  });

  // Toggle admin status for a user
  app.post('/api/admin/users/:userId/toggle-admin', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Toggle admin status
      const updatedUser = await storage.updateUser(userId, { 
        isAdmin: !user.isAdmin 
      });
      
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to toggle admin status:', error);
      res.status(500).json({ error: 'Failed to update user admin status' });
    }
  });

  // Flag user for policy violation
  app.post('/api/admin/users/:userId/flag', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const adminUser = req.user as User;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Use lockReason to flag user for policy violation review (without locking account)
      const updatedUser = await storage.updateUser(userId, { 
        lockReason: user.lockReason 
          ? `${user.lockReason}; FLAGGED: Policy violation review pending` 
          : 'FLAGGED: Policy violation review pending',
        lockedBy: adminUser.id,
        lockedAt: new Date()
      });
      
      res.json({ 
        success: true, 
        message: 'User flagged for policy violation review',
        user: updatedUser 
      });
    } catch (error) {
      logger.error('Failed to flag user:', error);
      res.status(500).json({ error: 'Failed to flag user' });
    }
  });

  // Content Moderation endpoints
  
  // Get all content reports
  app.get('/api/admin/reports', requireAdmin, async (req, res) => {
    try {
      const reports = await storage.getAllContentReports();
      res.json(reports);
    } catch (error) {
      logger.error('Failed to get content reports:', error);
      res.status(500).json({ error: 'Failed to fetch content reports' });
    }
  });

  // Get pending moderation content
  app.get('/api/admin/moderation/pending', requireAdmin, async (req, res) => {
    try {
      const pendingContent = await storage.getPendingModerationContent();
      res.json(pendingContent);
    } catch (error) {
      logger.error('Failed to get pending content:', error);
      res.status(500).json({ error: 'Failed to fetch pending content' });
    }
  });

  // Get reported images for admin review
  app.get('/api/admin/reported-images', requireAdmin, async (req, res) => {
    try {
      const reportedImages = await storage.getReportedImages();
      res.json(reportedImages);
    } catch (error) {
      logger.error('Failed to get reported images:', error);
      res.status(500).json({ error: 'Failed to fetch reported images' });
    }
  });

  // Approve reported image (remove flagged status)
  app.post('/api/admin/reported-images/:id/approve', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.approveReportedImage(id);
      res.json({ message: 'Image approved successfully' });
    } catch (error) {
      logger.error('Error approving reported image:', error);
      res.status(500).json({ error: 'Failed to approve reported image' });
    }
  });

  // Delete reported image permanently
  app.delete('/api/admin/reported-images/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteReportedImage(id);
      res.json({ message: 'Image deleted successfully' });
    } catch (error) {
      logger.error('Error deleting reported image:', error);
      res.status(500).json({ error: 'Failed to delete reported image' });
    }
  });

  // Moderate content (approve, reject, flag)
  app.post('/api/admin/moderate', requireAdmin, async (req, res) => {
    try {
      const { contentType, contentId, action, reason } = req.body;
      const moderatorId = (req.user as any)?.claims?.sub;
      if (!moderatorId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const result = await storage.moderateContent(
        contentType, 
        contentId, 
        action, 
        moderatorId, 
        reason
      );
      
      res.json(result);
    } catch (error) {
      logger.error('Failed to moderate content:', error);
      res.status(500).json({ error: 'Failed to moderate content' });
    }
  });

  // Bulk moderate content
  app.post('/api/admin/moderate/bulk', requireAdmin, async (req, res) => {
    try {
      const { items, action, reason } = req.body; // items = [{ contentType, contentId }]
      const moderatorId = (req.user as any)?.claims?.sub;
      if (!moderatorId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const results = await Promise.all(
        items.map((item: any) => 
          storage.moderateContent(
            item.contentType, 
            item.contentId, 
            action, 
            moderatorId, 
            reason
          )
        )
      );
      
      res.json({ processed: results.length, results });
    } catch (error) {
      logger.error('Failed to bulk moderate content:', error);
      res.status(500).json({ error: 'Failed to bulk moderate content' });
    }
  });

}
