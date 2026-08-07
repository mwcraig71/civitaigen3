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
import { RunPodService } from "../runpod-service";
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
      const [setting, apiKeySetting, endpointIdSetting] = await Promise.all([
        storage.getPlatformSetting('image_provider'),
        storage.getPlatformSetting('runpod_api_key'),
        storage.getPlatformSetting('runpod_endpoint_id'),
      ]);
      const provider = setting?.value || 'civitai';
      const diffusAvailable = diffusService.isAvailable();
      const runpodApiKey = apiKeySetting?.value || '';
      const runpodEndpointId = endpointIdSetting?.value || '';
      const runpodAvailable = !!(runpodApiKey && runpodEndpointId);

      const providerMessages: Record<string, string> = {
        diffus: 'Using Diffus API for image generation',
        runpod: 'Using RunPod Serverless API for image generation',
        civitai: 'Using CivitAI API for image generation',
      };

      res.json({
        provider,
        diffusAvailable,
        runpodAvailable,
        // Return masked key so the admin UI can show whether it's configured
        runpodApiKeyConfigured: runpodApiKey.length > 0,
        runpodEndpointId: runpodEndpointId || null,
        setting: setting || null,
        message: providerMessages[provider] ?? providerMessages.civitai,
      });
    } catch (error) {
      logger.error('Failed to get image provider setting:', error);
      res.status(500).json({ error: 'Failed to get image provider setting' });
    }
  });

  // Set image provider (admin only)
  app.post('/api/system/image-provider', requireAdmin, async (req, res) => {
    try {
      const { provider } = req.body;

      if (!['civitai', 'diffus', 'runpod'].includes(provider)) {
        return res.status(400).json({ error: 'provider must be "civitai", "diffus", or "runpod"' });
      }

      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Guard: Diffus requires an API key
      if (provider === 'diffus' && !diffusService.isAvailable()) {
        return res.status(400).json({
          error: 'Diffus API key not configured. Please add DIFFUS_API_KEY to secrets.',
          diffusAvailable: false,
        });
      }

      // Guard: RunPod requires both API key and endpoint ID in platform settings
      if (provider === 'runpod') {
        const [apiKeySetting, endpointIdSetting] = await Promise.all([
          storage.getPlatformSetting('runpod_api_key'),
          storage.getPlatformSetting('runpod_endpoint_id'),
        ]);
        if (!apiKeySetting?.value || !endpointIdSetting?.value) {
          return res.status(400).json({
            error: 'RunPod API key and endpoint ID must be saved before switching to RunPod.',
            runpodAvailable: false,
          });
        }
      }

      const setting = await storage.updatePlatformSetting(
        'image_provider',
        provider,
        userId,
        'Image generation API provider - civitai, diffus, or runpod'
      );

      logger.info(`🔀 IMAGE PROVIDER changed to ${provider.toUpperCase()} by admin: ${user.username} (${user.id})`);

      const providerMessages: Record<string, string> = {
        diffus: 'Now using Diffus API for image generation',
        runpod: 'Now using RunPod Serverless API for image generation',
        civitai: 'Now using CivitAI API for image generation',
      };

      res.json({
        success: true,
        provider,
        diffusAvailable: diffusService.isAvailable(),
        setting,
        message: providerMessages[provider] ?? providerMessages.civitai,
        updatedBy: { id: user.id, username: user.username },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to set image provider:', error);
      res.status(500).json({ error: 'Failed to set image provider' });
    }
  });

  // Get RunPod configuration (admin only) — key is returned masked
  app.get('/api/system/runpod-config', requireAdmin, async (req, res) => {
    try {
      const [apiKeySetting, endpointIdSetting] = await Promise.all([
        storage.getPlatformSetting('runpod_api_key'),
        storage.getPlatformSetting('runpod_endpoint_id'),
      ]);
      const rawKey = apiKeySetting?.value || '';
      const maskedKey = rawKey.length > 8
        ? rawKey.slice(0, 4) + '•'.repeat(rawKey.length - 8) + rawKey.slice(-4)
        : rawKey.length > 0 ? '•'.repeat(rawKey.length) : '';

      res.json({
        apiKeyConfigured: rawKey.length > 0,
        apiKeyMasked: maskedKey,
        endpointId: endpointIdSetting?.value || '',
      });
    } catch (error) {
      logger.error('Failed to get RunPod config:', error);
      res.status(500).json({ error: 'Failed to get RunPod config' });
    }
  });

  // Save RunPod configuration (admin only)
  app.post('/api/system/runpod-config', requireAdmin, async (req, res) => {
    try {
      // apiKey is optional — omit or send empty string to leave the stored key
      // unchanged.  endpointId is always required.
      const { apiKey, endpointId } = req.body;

      if (typeof endpointId !== 'string') {
        return res.status(400).json({ error: 'endpointId must be a string' });
      }
      if (apiKey !== undefined && typeof apiKey !== 'string') {
        return res.status(400).json({ error: 'apiKey must be a string when provided' });
      }

      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Only persist the API key when a non-empty replacement is explicitly
      // supplied.  An absent or empty apiKey leaves the existing value intact.
      const newKey = typeof apiKey === 'string' ? apiKey.trim() : '';
      const settingUpdates: Promise<any>[] = [
        storage.updatePlatformSetting('runpod_endpoint_id', endpointId.trim(), userId, 'RunPod Serverless endpoint ID'),
      ];
      if (newKey.length > 0) {
        settingUpdates.push(storage.updatePlatformSetting('runpod_api_key', newKey, userId, 'RunPod Serverless API key'));
      }
      await Promise.all(settingUpdates);

      logger.info(`🟣 RunPod config updated by admin: ${user.username} (key ${newKey.length > 0 ? 'replaced' : 'unchanged'})`);

      // For the response mask use the new key if supplied, otherwise the stored value.
      let rawKey = newKey;
      if (rawKey.length === 0) {
        const existing = await storage.getPlatformSetting('runpod_api_key');
        rawKey = existing?.value ?? '';
      }
      const maskedKey = rawKey.length > 8
        ? rawKey.slice(0, 4) + '•'.repeat(rawKey.length - 8) + rawKey.slice(-4)
        : rawKey.length > 0 ? '•'.repeat(rawKey.length) : '';

      res.json({
        success: true,
        apiKeyConfigured: rawKey.length > 0,
        apiKeyMasked: maskedKey,
        endpointId: endpointId.trim(),
      });
    } catch (error) {
      logger.error('Failed to save RunPod config:', error);
      res.status(500).json({ error: 'Failed to save RunPod config' });
    }
  });

  // Test RunPod connection (admin only)
  app.post('/api/system/runpod-test', requireAdmin, async (req, res) => {
    try {
      const [apiKeySetting, endpointIdSetting] = await Promise.all([
        storage.getPlatformSetting('runpod_api_key'),
        storage.getPlatformSetting('runpod_endpoint_id'),
      ]);
      const runpod = new RunPodService(
        apiKeySetting?.value || undefined,
        endpointIdSetting?.value || undefined
      );
      const result = await runpod.testConnection();
      res.json(result);
    } catch (error) {
      logger.error('Failed to test RunPod connection:', error);
      res.status(500).json({ success: false, message: 'Internal error testing RunPod connection' });
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
