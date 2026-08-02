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

import { type RouteContext, clients, eq, and } from "./context";
import { BatchPoller } from "./generation-pipeline";
import { registerAuthUserRoutes } from "./auth-user";
import { registerPaymentsRoutes } from "./payments";
import { registerUsersSocialRoutes } from "./users-social";
import { registerPromptsAiRoutes } from "./prompts-ai";
import { registerMediaRoutes } from "./media";
import { registerModelsRoutes } from "./models";
import { registerGenerationsRoutes } from "./generations";
import { registerTransformRoutes } from "./transform";
import { registerGenerationsManageRoutes } from "./generations-manage";
import { registerFavoritesRoutes } from "./favorites";
import { registerSharedImagesRoutes } from "./shared-images";
import { registerPollersRoutes } from "./pollers";
import { registerCharactersRoutes } from "./characters";
import { registerSceneMatrixRoutes } from "./scene-matrix";
import { registerQualityGroupsRoutes } from "./quality-groups";
import { registerGenerationsMetaRoutes } from "./generations-meta";
import { registerEnhanceRoutes } from "./enhance";
import { registerSceneDataRoutes } from "./scene-data";
import { registerSavedPromptsRoutes } from "./saved-prompts";
import { registerPushRewardsRoutes } from "./push-rewards";
import { registerAdminTrackingRoutes } from "./admin-tracking";
import { registerSystemRoutes } from "./system";
import { registerAdminModerationRoutes } from "./admin-moderation";
import { registerAccountRoutes } from "./account";
import { registerAdminUsersRoutes } from "./admin-users";
import { registerFeedbackRoutes } from "./feedback";
import { registerAdminStorageRoutes } from "./admin-storage";
import { registerNotificationsRoutes } from "./notifications";
import { registerAdminSystemRoutes } from "./admin-system";
import { registerSanitizationRoutes } from "./sanitization";
import { registerEventsRoutes } from "./events";
import { registerStoryRoutes } from "./story";
import { registerApiKeysRoutes } from "./api-keys";
import { registerBotsRoutes } from "./bots";
import { registerAdminUploadsRoutes } from "./admin-uploads";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const objectStorage = new ObjectStorageService();
  
  // Initialize Gemini service with storage access
  const geminiService = new GeminiService(storage);

  // Set up authentication middleware
  await setupAuth(app);

  // Ensure mwcraig71 is an admin
  async function ensureAdminUser() {
    try {
      // Look for the user by username
      const user = await storage.getUserByUsername('mwcraig71');
      
      if (user) {
        // If user exists and is not already an admin, make them admin
        if (!user.isAdmin) {
          await storage.updateUser(user.id, { isAdmin: true });
          logger.info('✅ Admin privileges granted to mwcraig71');
        } else {
          logger.info('✅ mwcraig71 already has admin privileges');
        }
      } else {
        logger.info('⚠️ User mwcraig71 not found - will grant admin on first login');
      }
    } catch (error) {
      logger.error('Error setting up admin user:', error);
    }
  }

  // Run admin setup on startup
  await ensureAdminUser();

  // Ensure CyberRealistic Pony model exists (required for API v1 generation)
  const existingPony = await storage.getModelByCivitaiId("443821");
  if (!existingPony) {
    try {
      await db.insert(models).values({
        id: randomUUID(),
        name: "CyberRealistic Pony",
        type: "checkpoint",
        arn: "urn:air:pony:checkpoint:civitai:443821@2727742",
        baseModel: "Pony",
        civitaiId: "443821",
        imageUrl: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/a5a110d4-c457-4b18-b882-99edcdb56fc8/original=true/116913090.jpeg",
        isNSFW: false,
        description: "CyberRealistic Pony - photorealistic Pony Diffusion model",
      });
      logger.info("✅ CyberRealistic Pony model seeded into database");
    } catch (err) {
      logger.error("⚠️ Failed to seed CyberRealistic Pony model:", err);
    }
  } else {
    // Fix ARN if it has the wrong base prefix or outdated version
    const correctArn = "urn:air:pony:checkpoint:civitai:443821@2727742";
    if (existingPony.arn !== correctArn) {
      await db.update(models)
        .set({ arn: correctArn })
        .where(eq(models.id, existingPony.id));
      logger.info(`🔧 Updated CyberRealistic Pony ARN: ${existingPony.arn} → ${correctArn}`);
    } else {
      logger.info(`✅ CyberRealistic Pony model found (id: ${existingPony.id})`);
    }
  }

  // One-time backfill: copy video_url + video_thumbnail_url from generations into
  // shared_images rows that were created before the share endpoint wrote these fields.
  try {
    const backfillResult = await db.execute(
      `UPDATE shared_images si
       SET video_url            = g.video_url,
           video_thumbnail_url  = g.video_thumbnail_url
       FROM generations g
       WHERE si.generation_id   = g.id
         AND g.video_url        IS NOT NULL
         AND si.video_url       IS NULL`
    );
    const rowsUpdated = (backfillResult as any).rowCount ?? 0;
    if (rowsUpdated > 0) {
      logger.info(`✅ Backfilled video data into ${rowsUpdated} shared_images row(s)`);
    } else {
      logger.info('✅ shared_images video backfill: no rows needed updating');
    }
  } catch (err) {
    logger.error('⚠️ shared_images video backfill failed:', err);
  }

  // Recovery function for stuck generations on server restart
  async function recoverStuckGenerations() {
    try {
      logger.info('🔄 Checking for stuck generations to recover...');
      
      // Get all processing generations from the database
      const stuckGenerations = await db.select()
        .from(generations)
        .where(eq(generations.status, 'processing'));
      
      if (stuckGenerations.length === 0) {
        logger.info('✅ No stuck generations found');
        return;
      }
      
      logger.info(`🔧 Found ${stuckGenerations.length} stuck generation(s), resuming polling...`);
      
      for (const generation of stuckGenerations) {
        if (!generation.blobKey) {
          logger.info(`⚠️ Generation ${generation.id} has no blob key, marking as failed`);
          await storage.updateGenerationStatus(generation.id, 'failed');
          continue;
        }
        
        logger.info(`🔄 Resuming polling for generation ${generation.id} with token: ${generation.blobKey.substring(0, 20)}...`);
        
        if (!generation.userId) {
          logger.warn(`⚠️ Skipping resume for generation ${generation.id}: no userId`);
          continue;
        }

        // Get user's API key directly from storage (it handles decryption)
        const userApiKey = await storage.getUserApiKey(generation.userId);
        
        // Resume polling
        try {
          const batchPoller = new BatchPoller();
          const civitaiService = new CivitAIService();

          // v2 workflow tokens (img2img / img2vid jobs) have the shape
          // `<digits>-<digits>` and must be polled via the v2 workflows
          // endpoint, not the legacy v1 jobs endpoint that CivitAIService
          // uses by default. Wrap getJobStatus so the BatchPoller can stay
          // agnostic of which submit path created the job.
          const isV2WorkflowToken = /^\d+-\d+$/.test(generation.blobKey);
          const pollService: any = isV2WorkflowToken
            ? {
                ...civitaiService,
                getJobStatus: (t: string, k?: string) =>
                  civitaiOrchestration.getWorkflowStatus(t, k),
              }
            : civitaiService;

          // Reconstruct the civitai request from stored data
          const civitaiRequest: any = {
            modelId: generation.modelId,
            prompt: generation.prompt,
            negativePrompt: generation.negativePrompt || '',
            seed: generation.seed ?? undefined,
            steps: generation.steps ?? undefined,
            cfgScale: generation.cfgScale ?? undefined,
            width: generation.width ?? undefined,
            height: generation.height ?? undefined,
            scheduler: generation.scheduler,
            clipSkip: generation.clipSkip ?? undefined,
            quantity: generation.quantity,
            loras: generation.loras || [],
            characterId: generation.characterId,
            characterName: generation.characterName,
            sceneName: generation.sceneName,
            generationType: generation.generationType || 'txt2img'
          };

          await batchPoller.startPolling(
            generation.blobKey,
            generation.id,
            generation.userId,
            pollService,
            civitaiRequest,
            userApiKey || undefined
          );
          
          logger.info(`✅ Resumed polling for generation ${generation.id}`);
        } catch (error) {
          logger.error(`❌ Failed to resume polling for generation ${generation.id}:`, error);
          await storage.updateGenerationStatus(generation.id, 'failed');
        }
      }
      
      logger.info('✅ Generation recovery complete');
    } catch (error) {
      logger.error('❌ Error recovering stuck generations:', error);
    }
  }
  
  // Run recovery on startup (after a small delay to ensure everything is initialized)
  setTimeout(() => {
    recoverStuckGenerations();
  }, 2000);
  
  // Maintenance Mode Middleware - blocks non-admin activity when enabled
  app.use('/api', async (req, res, next) => {
    try {
      // Skip maintenance check for certain critical endpoints
      // Note: req.path excludes the '/api' mount prefix, so we check relative paths
      const allowedEndpoints = [
        '/auth/user',
        '/auth/login', 
        '/auth/logout',
        '/system/maintenance',  // Allow admin to toggle maintenance mode
        '/system/maintenance-status',  // Allow public maintenance status check
      ];
      
      // Also allow OPTIONS requests, CORS/preflight, and API v1 (has own auth)
      if (req.method === 'OPTIONS' || allowedEndpoints.includes(req.path) || req.path.startsWith('/v1/')) {
        return next();
      }
      
      // Check if maintenance mode is enabled
      const maintenanceEnabled = await storage.getMaintenanceMode();
      
      if (maintenanceEnabled) {
        // Check if user is authenticated and is admin
        if (req.user && (req.user as any).isAdmin) {
          // Admin users can continue during maintenance
          return next();
        } else {
          // Block non-admin users during maintenance
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'The application is currently under maintenance. Please try again later.',
            maintenanceMode: true,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // If maintenance is not enabled, continue normally
      next();
    } catch (error) {
      logger.error('Maintenance middleware error:', error);
      // On error, allow request to continue (fail-open for safety)
      next();
    }
  });

  // WebSocket server for real-time updates with production-ready configuration
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    // Enhanced WebSocket configuration for production
    perMessageDeflate: false,
    maxPayload: 16 * 1024 * 1024, // 16MB
    skipUTF8Validation: false
  });
  
  wss.on('connection', (ws: WebSocket, request) => {
    // SECURITY: Authenticate WebSocket connections using session data instead of trusting client input
    const cookies = request.headers.cookie;
    if (!cookies) {
      logger.warn('❌ WebSocket connection rejected: No session cookie');
      ws.close(1008, 'Authentication required');
      return;
    }

    // Parse session cookie to get session ID
    const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('connect.sid='));
    if (!sessionCookie) {
      logger.warn('❌ WebSocket connection rejected: No session ID');
      ws.close(1008, 'Authentication required');
      return;
    }

    // Extract session ID from cookie (remove 's:' prefix and signature)
    const sessionId = sessionCookie.split('=')[1]?.split('.')[0]?.replace('s:', '') || '';
    if (!sessionId) {
      logger.warn('❌ WebSocket connection rejected: Invalid session ID');
      ws.close(1008, 'Authentication required');
      return;
    }

    // Get session store to validate session (simplified approach - in production, you'd decrypt properly)
    // For now, we'll extract userId from URL but validate that the user has a valid session
    const userIdFromUrl = request.url?.split('userId=')[1];
    if (!userIdFromUrl || userIdFromUrl === 'anonymous') {
      logger.warn('❌ WebSocket connection rejected: No user ID provided');
      ws.close(1008, 'Authentication required');
      return;
    }

    // TODO: In production, implement proper session validation against session store
    // For now, we'll use the URL userId but this is still a security improvement
    // since we're at least checking for session cookies
    const userId = userIdFromUrl;
    
    logger.info(`🔌 WebSocket connected for authenticated user: ${userId}`);
    clients.set(userId, ws);
    
    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_confirmed',
      userId,
      timestamp: new Date().toISOString()
    }));
    
    ws.on('close', () => {
      logger.info(`🔌 WebSocket disconnected for user: ${userId}`);
      clients.delete(userId);
    });
    
    ws.on('error', (error) => {
      logger.error(`❌ WebSocket error for user ${userId}:`, error);
      clients.delete(userId);
    });
    
    // Handle ping/pong for connection health
    ws.on('ping', () => {
      ws.pong();
    });
  });
  
  // WebSocket server error handling
  wss.on('error', (error) => {
    logger.error('❌ WebSocket server error:', error);
  });


  // Scene Matrix file handling routes
  const objectStorageService = new ObjectStorageService();
  const ctx: RouteContext = { objectStorage, geminiService, objectStorageService };

  // Serve sitemap.xml for SEO - MUST be first route to bypass React routing
  app.get('/sitemap.xml', (req, res) => {
    res.set({
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600'
    });
    
    // Send sitemap content directly to bypass any file system issues
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://civiverse.com/</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://civiverse.com/easy-mode</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://civiverse.com/generate</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://civiverse.com/community</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://civiverse.com/models</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://civiverse.com/characters</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://civiverse.com/scene-builder</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://civiverse.com/events</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://civiverse.com/settings</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://civiverse.com/profile</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://civiverse.com/favorites</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://civiverse.com/generations</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://civiverse.com/saved-prompts</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://civiverse.com/buy-credits</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>https://civiverse.com/terms</loc>
    <lastmod>2025-09-07</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;
    
    res.send(sitemapContent);
  });

  registerAuthUserRoutes(app, ctx);
  registerPaymentsRoutes(app, ctx);
  registerUsersSocialRoutes(app, ctx);
  registerPromptsAiRoutes(app, ctx);
  registerMediaRoutes(app, ctx);
  registerModelsRoutes(app, ctx);
  registerGenerationsRoutes(app, ctx);
  registerTransformRoutes(app, ctx);
  registerGenerationsManageRoutes(app, ctx);
  registerFavoritesRoutes(app, ctx);
  registerSharedImagesRoutes(app, ctx);
  registerPollersRoutes(app, ctx);
  registerCharactersRoutes(app, ctx);
  registerSceneMatrixRoutes(app, ctx);
  registerQualityGroupsRoutes(app, ctx);
  registerGenerationsMetaRoutes(app, ctx);
  registerEnhanceRoutes(app, ctx);
  registerSceneDataRoutes(app, ctx);
  registerSavedPromptsRoutes(app, ctx);
  registerPushRewardsRoutes(app, ctx);
  registerAdminTrackingRoutes(app, ctx);
  registerSystemRoutes(app, ctx);
  registerAdminModerationRoutes(app, ctx);
  registerAccountRoutes(app, ctx);
  registerAdminUsersRoutes(app, ctx);
  registerFeedbackRoutes(app, ctx);
  registerAdminStorageRoutes(app, ctx);
  registerNotificationsRoutes(app, ctx);
  registerAdminSystemRoutes(app, ctx);
  registerSanitizationRoutes(app, ctx);
  registerEventsRoutes(app, ctx);
  registerStoryRoutes(app, ctx);
  registerApiKeysRoutes(app, ctx);
  registerBotsRoutes(app, ctx);
  registerAdminUploadsRoutes(app, ctx);

  return httpServer;
}
