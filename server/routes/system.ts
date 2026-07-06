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

export function registerSystemRoutes(app: Express, ctx: RouteContext) {
  // System Settings/Maintenance Mode Endpoints
  
  // Public maintenance mode status check (no auth required)
  app.get('/api/system/maintenance-status', async (req, res) => {
    try {
      const maintenanceEnabled = await storage.getMaintenanceMode();
      const setting = await storage.getSystemSetting('maintenance_mode');
      
      res.json({
        enabled: maintenanceEnabled,
        message: maintenanceEnabled 
          ? 'The application is currently under maintenance. Please try again later.'
          : 'All systems operational'
      });
    } catch (error) {
      logger.error('Failed to get public maintenance status:', error);
      // On error, assume maintenance is not enabled (fail-safe)
      res.json({
        enabled: false,
        message: 'All systems operational'
      });
    }
  });
  
  // Get current maintenance mode status (admin only)
  app.get('/api/system/maintenance', requireAdmin, async (req, res) => {
    try {
      const maintenanceEnabled = await storage.getMaintenanceMode();
      const setting = await storage.getSystemSetting('maintenance_mode');
      
      res.json({
        enabled: maintenanceEnabled,
        setting: setting || null,
        message: maintenanceEnabled 
          ? 'Maintenance mode is currently ENABLED - non-admin users are blocked'
          : 'Maintenance mode is currently DISABLED - all users have access'
      });
    } catch (error) {
      logger.error('Failed to get maintenance status:', error);
      res.status(500).json({ error: 'Failed to get maintenance status' });
    }
  });

  // Toggle maintenance mode (admin only)
  app.post('/api/system/maintenance', requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled field must be a boolean' });
      }
      
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Update maintenance mode setting
      const setting = await storage.setMaintenanceMode(enabled, userId);
      
      const actionMessage = enabled ? 'ENABLED' : 'DISABLED';
      const userMessage = enabled 
        ? 'Maintenance mode enabled - non-admin users will be blocked from all API endpoints'
        : 'Maintenance mode disabled - all users now have normal access';
      
      logger.info(`🔧 MAINTENANCE MODE ${actionMessage} by admin: ${user.username} (${user.id})`);
      
      res.json({
        success: true,
        enabled,
        setting,
        message: userMessage,
        updatedBy: {
          id: user.id,
          username: user.username
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to toggle maintenance mode:', error);
      res.status(500).json({ error: 'Failed to toggle maintenance mode' });
    }
  });

  // Get rating filter status (admin only)
  app.get('/api/system/rating-filter', requireAdmin, async (req, res) => {
    try {
      const setting = await storage.getSystemSetting('rating_filter_enabled');
      const enabled = setting?.value === 'true';
      
      res.json({
        enabled,
        setting: setting || null,
        message: enabled 
          ? 'Rating filter is ENABLED - only R and PG rated images are shown to all users'
          : 'Rating filter is DISABLED - all ratings are visible to all users'
      });
    } catch (error) {
      logger.error('Failed to get rating filter status:', error);
      res.status(500).json({ error: 'Failed to get rating filter status' });
    }
  });

  // Toggle rating filter (admin only)
  app.post('/api/system/rating-filter', requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled field must be a boolean' });
      }
      
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Update rating filter setting
      const setting = await storage.updateSystemSetting('rating_filter_enabled', enabled.toString(), userId, 
        'Global content rating filter - when enabled, only R and PG rated images are shown');
      
      const actionMessage = enabled ? 'ENABLED' : 'DISABLED';
      const userMessage = enabled 
        ? 'Rating filter enabled - only R and PG rated images will be shown to all users'
        : 'Rating filter disabled - all ratings are now visible to all users';
      
      logger.info(`🔒 RATING FILTER ${actionMessage} by admin: ${user.username} (${user.id})`);
      
      res.json({
        success: true,
        enabled,
        setting,
        message: userMessage,
        updatedBy: {
          id: user.id,
          username: user.username
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to toggle rating filter:', error);
      res.status(500).json({ error: 'Failed to toggle rating filter' });
    }
  });

  // Get image provider setting (admin only)
  app.get('/api/system/image-provider', requireAdmin, async (req, res) => {
    try {
      const setting = await storage.getPlatformSetting('image_provider');
      const provider = setting?.value || 'civitai';
      const diffusAvailable = diffusService.isAvailable();
      
      res.json({
        provider,
        diffusAvailable,
        setting: setting || null,
        message: provider === 'diffus' 
          ? 'Using Diffus API for image generation'
          : 'Using CivitAI API for image generation'
      });
    } catch (error) {
      logger.error('Failed to get image provider setting:', error);
      res.status(500).json({ error: 'Failed to get image provider setting' });
    }
  });

  // Toggle image provider (admin only)
  app.post('/api/system/image-provider', requireAdmin, async (req, res) => {
    try {
      const { provider } = req.body;
      
      if (!['civitai', 'diffus'].includes(provider)) {
        return res.status(400).json({ error: 'provider must be either "civitai" or "diffus"' });
      }
      
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Check if Diffus is available when trying to switch to it
      if (provider === 'diffus' && !diffusService.isAvailable()) {
        return res.status(400).json({ 
          error: 'Diffus API key not configured. Please add DIFFUS_API_KEY to secrets.',
          diffusAvailable: false
        });
      }
      
      // Update image provider setting
      const setting = await storage.updatePlatformSetting(
        'image_provider', 
        provider, 
        userId, 
        'Image generation API provider - civitai or diffus'
      );
      
      logger.info(`🔀 IMAGE PROVIDER changed to ${provider.toUpperCase()} by admin: ${user.username} (${user.id})`);
      
      res.json({
        success: true,
        provider,
        diffusAvailable: diffusService.isAvailable(),
        setting,
        message: provider === 'diffus' 
          ? 'Now using Diffus API for image generation'
          : 'Now using CivitAI API for image generation',
        updatedBy: {
          id: user.id,
          username: user.username
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to set image provider:', error);
      res.status(500).json({ error: 'Failed to set image provider' });
    }
  });

  // Get all system settings (admin only)
  app.get('/api/system/settings', requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      logger.error('Failed to get system settings:', error);
      res.status(500).json({ error: 'Failed to get system settings' });
    }
  });

}
