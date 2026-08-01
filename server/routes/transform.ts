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

import { type RouteContext, eq, and, batchTracker, broadcastToUser } from "./context";
import { processIndividualImage, BatchPoller, batchPoller, pollCivitAIJob } from "./generation-pipeline";

export function registerTransformRoutes(app: Express, ctx: RouteContext) {
  const { objectStorageService } = ctx;
  // =================================================================
  // TRANSFORM STUDIO — image-to-image + image-to-video
  // =================================================================

  // Pricing for transform jobs — defaults from env, overridable at runtime via admin platform settings.
  const TRANSFORM_IMG2IMG_COST_DEFAULT = parseInt(process.env.TRANSFORM_IMG2IMG_COST || "15", 10);
  const TRANSFORM_IMG2VID_COST_DEFAULT = parseInt(process.env.TRANSFORM_IMG2VID_COST || "80", 10);
  async function getTransformCost(mode: "img2img" | "img2vid"): Promise<number> {
    const key = mode === "img2vid" ? "transform_img2vid_cost" : "transform_img2img_cost";
    const setting = await storage.getPlatformSetting(key);
    return setting ? parseInt(setting.value, 10) : (mode === "img2vid" ? TRANSFORM_IMG2VID_COST_DEFAULT : TRANSFORM_IMG2IMG_COST_DEFAULT);
  }

  // Issue a signed PUT URL for the user to upload a source image directly
  // to object storage. We then pass the resulting public read URL back to
  // CivitAI orchestration as the `sourceImage`.
  // Per-user rate-limit so signed-upload URLs can't be farmed indefinitely.
  const transformUploadLimits = new Map<string, { count: number; windowStart: number }>();
  app.post("/api/transform/upload-url", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      // Allow at most 30 upload URLs per user per 10-minute window.
      const now = Date.now();
      const windowMs = 10 * 60 * 1000;
      const rec = transformUploadLimits.get(userId);
      if (!rec || now - rec.windowStart > windowMs) {
        transformUploadLimits.set(userId, { count: 1, windowStart: now });
      } else {
        rec.count++;
        if (rec.count > 30) {
          return res.status(429).json({ message: "Too many upload requests — please wait a moment." });
        }
      }

      const objectStorageService = new ObjectStorageService();
      // CivitAI needs a signed GET URL it can actually read; stripping the
      // PUT query string would yield an unsigned (private) URL.
      const { uploadURL, readURL, objectPath } = await objectStorageService.getObjectEntityUploadAndReadURLs(24 * 3600);
      res.json({ uploadURL, readURL, objectPath });
    } catch (error) {
      logger.error("❌ transform upload-url failed:", error);
      res.status(500).json({ message: "Failed to issue upload URL" });
    }
  });

  app.post("/api/transform", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const parsed = transformRequestSchema.parse(req.body);

      // Full safety pipeline — identical to txt2img path in
      // CivitAIService.generateImage. Order matters: hard block first,
      // then sanitize ages, then DB-driven rule injection.
      const contentCheck = civitaiService.checkForUnderageContent(parsed.prompt);
      if (contentCheck.hasViolation) {
        return res.status(400).json({
          message: "Prompt contains prohibited content",
          details: contentCheck.details,
        });
      }
      let safePrompt = civitaiService.sanitizePromptAges(parsed.prompt);
      safePrompt = await civitaiService.applyPositivePromptRules(safePrompt);
      let safeNeg = civitaiService.sanitizeNegativePrompt(parsed.negativePrompt || "");
      safeNeg = await civitaiService.applyNegativePromptRules(safeNeg);

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      // Backend enforcement: max video duration and allowed engine gating.
      if (parsed.mode === "img2vid") {
        const maxDurSetting = await storage.getPlatformSetting("video_max_duration_seconds");
        const maxDur = maxDurSetting ? parseInt(maxDurSetting.value, 10) : 10;
        if ((parsed.durationSeconds || 4) > maxDur) {
          return res.status(400).json({
            message: `Video duration exceeds platform maximum of ${maxDur}s. Requested: ${parsed.durationSeconds}s.`,
          });
        }
        const allowedEngSetting = await storage.getPlatformSetting("allowed_video_engines");
        if (allowedEngSetting?.value) {
          const allowed = allowedEngSetting.value.split(",").map(s => s.trim()).filter(Boolean);
          if (allowed.length > 0 && !allowed.includes(parsed.videoEngine || "wan-comfy-2.1")) {
            return res.status(400).json({
              message: `Video engine "${parsed.videoEngine}" is not currently enabled. Allowed: ${allowed.join(", ")}.`,
            });
          }
        }
      }

      const cost = await getTransformCost(parsed.mode);
      if ((user.buzzCredits || 0) < cost) {
        return res.status(400).json({
          message: `Insufficient Buzz credits. ${parsed.mode === "img2vid" ? "Video" : "Image"} transform costs ${cost} credits.`,
        });
      }

      // Resolve model for img2img. img2img now runs on Flux 2 Klein (hosted on
      // Civitai infra), which does NOT use the selected checkpoint's AIR URN —
      // so we no longer require a Flux model or a non-empty ARN. We still resolve
      // the selected model (when provided) purely for the generation record /
      // gallery metadata.
      let modelArn: string | undefined;
      let baseModel: string | undefined;
      let resolvedModelId: string | undefined;
      if (parsed.mode === "img2img") {
        // modelId is optional — img2img always runs on Flux 2 Klein regardless
        // of any checkpoint selection. Resolve it only when provided (purely for
        // generation record metadata / gallery display).
        if (parsed.modelId) {
          const model = await storage.getModel(parsed.modelId);
          if (model) {
            baseModel = model.baseModel || "";
            resolvedModelId = model.id;
            modelArn = model.arn || undefined;
          }
        }
        // Fallback display values so the gallery shows something sensible.
        if (!resolvedModelId) {
          baseModel = baseModel || "flux2";
        }
      }

      // If the client sent a durable object path, mint a fresh signed URL now
      // (the original signed readURL may have expired if the user re-submits later).
      // Store the object path as `sourceImageUrl` so it can be re-minted on
      // future regenerations. Fall back to the signed URL for immediate use.
      let effectiveSourceUrl = parsed.sourceImageUrl;
      if (parsed.sourceImageObjectPath) {
        try {
          const objStoreSvc = new ObjectStorageService();
          effectiveSourceUrl = await objStoreSvc.getSignedReadUrl(parsed.sourceImageObjectPath, 24 * 3600);
        } catch (e) {
          logger.warn("⚠️ Failed to mint fresh signed URL from objectPath; using provided URL", e);
        }
      }

      // Record the source image upload for admin visibility (5-day retention).
      let sourceUploadId: string | undefined;
      if (parsed.sourceImageObjectPath) {
        try {
          const su = await storage.createSourceUpload({
            userId,
            objectPath: parsed.sourceImageObjectPath,
            generationType: parsed.mode,
          });
          sourceUploadId = su.id;
        } catch (e) {
          logger.warn("⚠️ Failed to record source upload:", e);
        }
      }

      // Persist generation row immediately so the user sees it in their gallery.
      const generation = await storage.createGeneration({
        userId,
        modelId: resolvedModelId,
        prompt: safePrompt,
        negativePrompt: safeNeg,
        seed: parsed.seed ?? -1,
        steps: parsed.steps,
        cfgScale: Math.round((parsed.cfgScale ?? 7) * 10),
        width: parsed.width ?? 1024,
        height: parsed.height ?? 1024,
        scheduler: parsed.scheduler,
        clipSkip: 2,
        quantity: 1,
        loras: [],
        generationType: parsed.mode, // "img2img" | "img2vid"
        // Store durable object path if available, otherwise the signed URL.
        sourceImageUrl: parsed.sourceImageObjectPath || parsed.sourceImageUrl,
        denoiseStrength: Math.round((parsed.denoiseStrength ?? 0.5) * 100),
      } as any);

      // Link the source upload record to this generation now that we have the ID.
      if (sourceUploadId) {
        storage.linkSourceUploadToGeneration(sourceUploadId, generation.id).catch(() => {});
      }

      // Attach video metadata fields up-front for img2vid so the UI can
      // render the right preview shell while polling.
      if (parsed.mode === "img2vid") {
        await storage.updateGeneration(generation.id, {
          videoModelEngine: parsed.videoEngine,
          videoFps: parsed.fps,
          videoDurationSeconds: parsed.durationSeconds,
        } as any);
      }

      // Mark this generation in the batch tracker as a single-result job so
      // the existing BatchPoller can manage progress + completion semantics.
      batchTracker.set(generation.id, {
        totalImages: 1,
        completedImages: 0,
        userId,
        firstImageClaimed: false,
        transformCost: cost,
      } as any);

      // Deduct credits before kicking off the async job.
      await storage.updateUserCredits(userId, Math.max(0, (user.buzzCredits || 0) - cost));

      const userApiKey = await storage.getUserApiKey(userId);

      // Kick off in the background — respond to the client immediately.
      (async () => {
        try {
          let submit;
          if (parsed.mode === "img2img") {
            submit = await civitaiOrchestration.submitImg2Img(
              {
                sourceImageUrl: effectiveSourceUrl,
                prompt: safePrompt,
                negativePrompt: safeNeg,
                modelArn: modelArn!,
                baseModel: baseModel!,
                denoiseStrength: parsed.denoiseStrength,
                steps: parsed.steps,
                cfgScale: parsed.cfgScale,
                scheduler: parsed.scheduler,
                width: parsed.width,
                height: parsed.height,
                seed: parsed.seed,
              },
              userApiKey || undefined
            );
          } else {
            submit = await civitaiOrchestration.submitImg2Vid(
              {
                sourceImageUrl: effectiveSourceUrl,
                prompt: safePrompt,
                negativePrompt: safeNeg,
                engine: parsed.videoEngine,
                durationSeconds: parsed.durationSeconds,
                fps: parsed.fps,
                motionStrength: parsed.motionStrength,
                seed: parsed.seed,
              },
              userApiKey || undefined
            );
          }

          await storage.updateGenerationStatus(generation.id, "processing", undefined, submit.token);
          broadcastToUser(userId, {
            type: "generation_update",
            generationId: generation.id,
            status: "processing",
            progress: 10,
          });

          // Reuse the existing batchPoller. We tag the request with
          // mediaType so processIndividualImage can branch into the video
          // handler for img2vid results.
          const pollReq = {
            mode: parsed.mode,
            mediaType: parsed.mode === "img2vid" ? "video" : "image",
            prompt: safePrompt,
            negativePrompt: safeNeg,
            sourceImageUrl: parsed.sourceImageUrl,
            videoEngine: parsed.videoEngine,
            fps: parsed.fps,
            durationSeconds: parsed.durationSeconds,
          };

          // Both img2img and img2vid now go through the v2 workflows API
          // and return a workflow id rather than a v1 job token, so both
          // poll via getWorkflowStatus.
          const pollerService = {
            getJobStatus: (t: string, k?: string) => civitaiOrchestration.getWorkflowStatus(t, k),
          };

          pollCivitAIJob(submit.token, generation.id, userId, pollerService, pollReq, userApiKey || undefined);
        } catch (bgErr) {
          const errMsg = (bgErr as Error).message || "Transform failed";
          // Detect content-policy / NSFW rejections and give a clear user message.
          // Grok returns `reason:"blocked"` for xAI policy violations.
          // FAL (WAN) may return NSFW/safety errors on explicit prompts.
          const isGrokBlocked = /blocked|reason.*blocked/i.test(errMsg);
          const isNsfwRejection =
            isGrokBlocked ||
            /nsfw|content.?policy|safety|explicit|inappropriate|moderat/i.test(errMsg) ||
            /400|403/.test(errMsg);
          const userMessage = isGrokBlocked
            ? "Video generation failed — content blocked by xAI policy. Try a different prompt or source image."
            : isNsfwRejection
            ? "Video generation failed — the content was flagged. Try a less explicit prompt or source image."
            : errMsg;
          logger.error("❌ Transform submit failed:", bgErr);
          await storage.updateGenerationStatus(generation.id, "failed");
          // Refund credits on submit failure
          const refreshed = await storage.getUser(userId);
          if (refreshed) {
            await storage.updateUserCredits(userId, (refreshed.buzzCredits || 0) + cost);
          }
          batchTracker.delete(generation.id);
          broadcastToUser(userId, {
            type: "generation_update",
            generationId: generation.id,
            status: "failed",
            progress: 0,
            message: userMessage,
          });
        }
      })().catch((e) => logger.error("Transform bg unhandled:", e));

      res.json({ id: generation.id, status: "pending", mode: parsed.mode, cost });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid transform request", errors: error.errors });
      }
      logger.error("Transform error:", error);
      res.status(500).json({ message: (error as Error).message || "Failed to start transform" });
    }
  });

}
