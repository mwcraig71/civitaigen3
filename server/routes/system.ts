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
import { ComfyUIService } from "../comfyui-service";
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
import { previewAllLoRAResolutions } from "../runpod-lora-resolver";

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
      const [setting, baseUrlSetting] = await Promise.all([
        storage.getPlatformSetting('image_provider'),
        storage.getPlatformSetting('runpod_base_url'),
      ]);
      const provider = setting?.value || 'civitai';
      const diffusAvailable = diffusService.isAvailable();
      const runpodBaseUrl = baseUrlSetting?.value || '';
      const runpodAvailable = !!runpodBaseUrl;

      const providerMessages: Record<string, string> = {
        diffus: 'Using Diffus API for image generation',
        runpod: 'Using ComfyUI (RunPod) for image generation',
        civitai: 'Using CivitAI API for image generation',
      };

      res.json({
        provider,
        diffusAvailable,
        runpodAvailable,
        runpodBaseUrl: runpodBaseUrl || null,
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

      // Guard: RunPod requires a ComfyUI base URL
      if (provider === 'runpod') {
        const baseUrlSetting = await storage.getPlatformSetting('runpod_base_url');
        if (!baseUrlSetting?.value) {
          return res.status(400).json({
            error: 'ComfyUI base URL must be saved before switching to RunPod.',
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

  // Get RunPod / ComfyUI configuration (admin only)
  app.get('/api/system/runpod-config', requireAdmin, async (req, res) => {
    try {
      const [baseUrlSetting, checkpointSetting] = await Promise.all([
        storage.getPlatformSetting('runpod_base_url'),
        storage.getPlatformSetting('runpod_checkpoint'),
      ]);
      res.json({
        baseUrl: baseUrlSetting?.value || '',
        checkpointName: checkpointSetting?.value || '',
      });
    } catch (error) {
      logger.error('Failed to get RunPod config:', error);
      res.status(500).json({ error: 'Failed to get RunPod config' });
    }
  });

  // Save RunPod / ComfyUI configuration (admin only)
  app.post('/api/system/runpod-config', requireAdmin, async (req, res) => {
    try {
      const { baseUrl, checkpointName } = req.body;
      if (typeof baseUrl !== 'string') {
        return res.status(400).json({ error: 'baseUrl must be a string' });
      }
      if (checkpointName !== undefined && typeof checkpointName !== 'string') {
        return res.status(400).json({ error: 'checkpointName must be a string when provided' });
      }

      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: 'User not found' });

      const trimmedUrl = baseUrl.trim().replace(/\/+$/, '');
      await Promise.all([
        storage.updatePlatformSetting('runpod_base_url', trimmedUrl, userId, 'ComfyUI base URL (RunPod pod URL, e.g. https://…-3000.proxy.runpod.net)'),
        storage.updatePlatformSetting('runpod_checkpoint', (checkpointName ?? '').trim(), userId, 'ComfyUI checkpoint filename (e.g. dreamshaper_8.safetensors)'),
      ]);

      logger.info(`🟣 RunPod/ComfyUI config updated by admin: ${user.username} — URL: ${trimmedUrl}`);
      res.json({ success: true, baseUrl: trimmedUrl, checkpointName: (checkpointName ?? '').trim() });
    } catch (error) {
      logger.error('Failed to save RunPod config:', error);
      res.status(500).json({ error: 'Failed to save RunPod config' });
    }
  });

  // Test RunPod / ComfyUI connection (admin only)
  app.post('/api/system/runpod-test', requireAdmin, async (req, res) => {
    try {
      const baseUrlSetting = await storage.getPlatformSetting('runpod_base_url');
      const comfyui = new ComfyUIService(baseUrlSetting?.value || undefined);
      const result = await comfyui.testConnection();
      logger.info(`🧪 [ComfyUI] Connection test result: success=${result.success} — ${result.message}`);
      res.json(result);
    } catch (error) {
      logger.error('Failed to test RunPod/ComfyUI connection:', error);
      res.status(500).json({ success: false, message: 'Internal error testing ComfyUI connection' });
    }
  });

  // ── RunPod LoRA config ──────────────────────────────────────────────────────

  // Get RunPod LoRA configuration: NV base path + model→filename mappings
  app.get('/api/system/runpod-lora-config', requireAdmin, async (req, res) => {
    try {
      const [nvPathSetting, mappingsSetting] = await Promise.all([
        storage.getPlatformSetting('runpod_nv_base_path'),
        storage.getPlatformSetting('runpod_lora_mappings'),
      ]);
      let loraMappings: Record<string, string> = {};
      if (mappingsSetting?.value) {
        try { loraMappings = JSON.parse(mappingsSetting.value); } catch { /* ignore corrupt JSON */ }
      }
      res.json({
        nvBasePath: nvPathSetting?.value || '',
        loraMappings,
      });
    } catch (error) {
      logger.error('Failed to get RunPod LoRA config:', error);
      res.status(500).json({ error: 'Failed to get RunPod LoRA config' });
    }
  });

  // Save RunPod LoRA configuration
  app.post('/api/system/runpod-lora-config', requireAdmin, async (req, res) => {
    try {
      const { nvBasePath, loraMappings } = req.body;
      if (typeof nvBasePath !== 'string') {
        return res.status(400).json({ error: 'nvBasePath must be a string' });
      }
      if (typeof loraMappings !== 'object' || Array.isArray(loraMappings) || loraMappings === null) {
        return res.status(400).json({ error: 'loraMappings must be a plain object' });
      }
      // Validate all values are strings
      for (const [k, v] of Object.entries(loraMappings)) {
        if (typeof v !== 'string') {
          return res.status(400).json({ error: `loraMappings["${k}"] must be a string filename` });
        }
      }
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: 'User not found' });

      await Promise.all([
        storage.updatePlatformSetting('runpod_nv_base_path', nvBasePath.trim(), userId, 'RunPod Network Volume base path for pre-cached LoRAs'),
        storage.updatePlatformSetting('runpod_lora_mappings', JSON.stringify(loraMappings), userId, 'RunPod LoRA model-ID to NV filename mappings (JSON)'),
      ]);

      logger.info(`🟣 RunPod LoRA config updated by admin: ${user.username}`);
      res.json({ success: true, nvBasePath: nvBasePath.trim(), loraMappings });
    } catch (error) {
      logger.error('Failed to save RunPod LoRA config:', error);
      res.status(500).json({ error: 'Failed to save RunPod LoRA config' });
    }
  });

  // Get LoRA resolution preview — how each imported LoRA would be resolved
  app.get('/api/system/runpod-lora-preview', requireAdmin, async (req, res) => {
    try {
      const [nvPathSetting, mappingsSetting] = await Promise.all([
        storage.getPlatformSetting('runpod_nv_base_path'),
        storage.getPlatformSetting('runpod_lora_mappings'),
      ]);
      let loraMappings: Record<string, string> = {};
      if (mappingsSetting?.value) {
        try { loraMappings = JSON.parse(mappingsSetting.value); } catch { /* ignore */ }
      }
      const preview = await previewAllLoRAResolutions(nvPathSetting?.value || '', loraMappings);
      res.json({ preview });
    } catch (error) {
      logger.error('Failed to generate RunPod LoRA preview:', error);
      res.status(500).json({ error: 'Failed to generate LoRA resolution preview' });
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
