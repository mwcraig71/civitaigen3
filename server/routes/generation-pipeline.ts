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

import { eq, and, batchTracker, broadcastToUser, clients } from "./context";

/**
 * Translate a raw server/CivitAI error into a specific, actionable message the
 * user can act on immediately. Covers every known failure mode.
 */
function friendlyGenerationError(raw: string): string {
  const m = raw.toLowerCase();

  // ── CivitAI content-policy / TOS blocks ──────────────────────────────────
  if (m.includes("real person") || m.includes("real-person")) {
    return (
      "CivitAI detected a real person's name in your prompt and blocked it. " +
      "Remove any celebrity names, person-specific LoRA trigger words (e.g. c2n0n), " +
      "or <lora:PersonName> tags and try again."
    );
  }
  if (
    m.includes("violate tos") ||
    m.includes("violate the tos") ||
    m.includes("prompt blocked") ||
    m.includes("content policy") ||
    m.includes("not allowed") ||
    m.includes("prohibited")
  ) {
    return (
      "Your prompt was blocked by CivitAI's content filter. Common causes: " +
      "celebrity or real-person names, underage references, or platform-prohibited terms. " +
      "Edit the prompt to remove those terms and try again."
    );
  }

  // ── Our own underage-content guard ───────────────────────────────────────
  if (m.includes("content policy violation") || m.includes("generation blocked")) {
    const detail = raw.replace(/^Content policy violation detected\. Generation blocked\.\s*Details:\s*/i, "");
    return `Generation blocked by content guard: ${detail}. Remove underage or prohibited references from your prompt.`;
  }

  // ── Buzz / credits ────────────────────────────────────────────────────────
  if (m.includes("insufficientbuzz") || m.includes("insufficient buzz") || m.includes("not enough buzz")) {
    return (
      "Not enough Buzz credits to generate this image. " +
      "Add more credits on civitai.com, or reduce the number of images / steps to lower the cost."
    );
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (m.includes("rate limit") || m.includes("too many requests") || raw.includes("429")) {
    return "CivitAI is rate-limiting your account right now. Wait 1–2 minutes and try again.";
  }

  // ── CivitAI server errors ─────────────────────────────────────────────────
  if (m.includes("temporarily unavailable") || m.includes("http 5") || m.includes("503") || m.includes("502")) {
    return "CivitAI's servers are temporarily overloaded. Wait a minute and try again.";
  }

  // ── Source image problems (img2img) ───────────────────────────────────────
  if (m.includes("source image") || m.includes("blob upload") || m.includes("failed to fetch source")) {
    return (
      "The source image couldn't be uploaded to CivitAI. " +
      "Make sure the image is a valid JPEG/PNG and try again. " +
      "If the problem persists, save the image locally and re-upload it."
    );
  }
  if (m.includes("private") || m.includes("reserved address") || m.includes("private ip")) {
    return "The source image URL points to a private/internal address and can't be used. Use a publicly accessible image URL.";
  }

  // ── Model / config errors ─────────────────────────────────────────────────
  if (m.includes("no derived type") || m.includes("unrecognized type") || m.includes("invalid ecosystem")) {
    return (
      "The selected model isn't compatible with the generation settings. " +
      "Try re-selecting the model from the list, or switch to a different checkpoint."
    );
  }
  if (m.includes("workflow returned no id") || m.includes("invalid json")) {
    return "CivitAI returned an unexpected response. Try again — if it keeps happening, the model may be temporarily unavailable.";
  }

  // ── Network / connectivity ────────────────────────────────────────────────
  if (m.includes("econnrefused") || m.includes("enotfound") || m.includes("network") || m.includes("fetch failed")) {
    return "Couldn't reach CivitAI — check your internet connection and try again.";
  }

  // ── Silent blob failure (dead output from poller) ─────────────────────────
  if (m.includes("blob") && (m.includes("unavailable") || m.includes("not available"))) {
    return (
      "CivitAI processed the job but didn't return an image. " +
      "This usually means the prompt was silently blocked by their NSFW filter. " +
      "Try softening explicit terms, removing LoRA trigger words one at a time, or switching to a different checkpoint."
    );
  }

  // ── Fallback: return the raw message so at least it's visible ────────────
  return raw;
}

  // Image enhancement processing with Replicate
  async function processEnhancements(enhancements: any[], generations: any[]) {
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    for (let i = 0; i < enhancements.length; i++) {
      const enhancement = enhancements[i];
      const generation = generations[i];

      try {
        logger.info(`🔍 Starting enhancement for ${enhancement.id} (${i + 1}/${enhancements.length})`);
        logger.info(`🎯 Using model: ${enhancement.enhancementModel || 'realesrgan'}`);
        
        // Get the image from object storage if available, otherwise use the URL
        let imageInput: string;
        
        if (generation.storedImagePath) {
          // Read image from object storage and convert to base64 data URI
          logger.info(`📂 Reading image from object storage: ${generation.storedImagePath}`);
          const { bucketName, objectName } = parseObjectPath(generation.storedImagePath);
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          const [exists] = await file.exists();
          if (!exists) {
            throw new Error(`Image not found in object storage: ${generation.storedImagePath}`);
          }
          
          // Download the file as a buffer
          const [imageBuffer] = await file.download();
          
          // Convert to base64 data URI
          const base64Image = imageBuffer.toString('base64');
          imageInput = `data:image/jpeg;base64,${base64Image}`;
          logger.info(`✅ Converted image to base64 data URI (${imageBuffer.length} bytes)`);
        } else if (generation.imageUrl) {
          // Fallback to URL if no stored path (shouldn't happen for newer images)
          logger.info(`⚠️ Using URL fallback (may expire): ${generation.imageUrl}`);
          imageInput = generation.imageUrl;
        } else {
          throw new Error('No image source found for generation');
        }

        let output: any;
        const startTime = Date.now();

        let enhancedImageUrl: string;

        if (enhancement.enhancementModel === 'gfpgan') {
          // Use GFPGAN for face restoration
          const input = {
            img: imageInput,
            version: 'v1.4',
            scale: enhancement.scaleFactor,
          };

          logger.info(`📡 Calling Replicate GFPGAN (data URI length: ${imageInput.length} chars)`);

          // Use predictions API for better error handling
          const prediction = await replicate.predictions.create({
            version: "9283608cc6b7be6b65a8e44983db012355fde4132009bf99d976b2f0896856a3",
            input: input,
          });

          logger.info(`📡 GFPGAN prediction created:`, prediction.id);
          logger.info(`📡 Prediction status:`, prediction.status);

          // Wait for the prediction to complete
          let finalPrediction = prediction;
          while (
            finalPrediction.status !== "succeeded" &&
            finalPrediction.status !== "failed" &&
            finalPrediction.status !== "canceled"
          ) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            finalPrediction = await replicate.predictions.get(prediction.id);
            logger.info(`📡 Prediction status:`, finalPrediction.status);
          }

          if (finalPrediction.status !== "succeeded") {
            throw new Error(`GFPGAN prediction ${finalPrediction.status}: ${finalPrediction.error || 'Unknown error'}`);
          }

          output = finalPrediction.output;
          logger.info(`📦 GFPGAN raw output:`, JSON.stringify(output, null, 2));

          // GFPGAN returns nested object/array structure - extract the URL properly
          if (typeof output === 'string') {
            enhancedImageUrl = output;
          } else if (Array.isArray(output)) {
            // Array response: [{ restored_image: "url" }] or ["url"]
            const first = output[0];
            if (typeof first === 'string') {
              enhancedImageUrl = first;
            } else if (first?.restored_image) {
              enhancedImageUrl = first.restored_image;
            } else {
              throw new Error(`Unexpected GFPGAN array element format: ${JSON.stringify(first)}`);
            }
          } else if (Array.isArray(output.output)) {
            // Nested array: { output: [{ restored_image: "url" }] }
            const first = output.output[0];
            if (typeof first === 'string') {
              enhancedImageUrl = first;
            } else if (first?.restored_image) {
              enhancedImageUrl = first.restored_image;
            } else {
              throw new Error(`Unexpected GFPGAN nested array element format: ${JSON.stringify(first)}`);
            }
          } else if (output.output?.restored_image) {
            // Nested object: { output: { restored_image: "url" } }
            enhancedImageUrl = output.output.restored_image;
          } else if (typeof output.output === 'string') {
            // Single nesting: { output: "url" }
            enhancedImageUrl = output.output;
          } else if (output.restored_image) {
            // Direct property: { restored_image: "url" }
            enhancedImageUrl = output.restored_image;
          } else {
            throw new Error(`Unexpected GFPGAN output format: ${JSON.stringify(output)}`);
          }

          // Validate we got a valid URL string
          if (typeof enhancedImageUrl !== 'string' || !enhancedImageUrl.startsWith('http')) {
            throw new Error(`Invalid GFPGAN URL extracted: ${enhancedImageUrl} (type: ${typeof enhancedImageUrl})`);
          }
        } else {
          // Use Real-ESRGAN for general upscaling
          const input = {
            image: imageInput,
            scale: enhancement.scaleFactor,
            face_enhance: enhancement.faceEnhancement,
          };

          logger.info(`📡 Calling Replicate Real-ESRGAN with input (base64 length: ${imageInput.length} chars):`);

          output = await replicate.run(
            "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
            { input }
          );

          // Real-ESRGAN returns direct URL or array
          enhancedImageUrl = Array.isArray(output) ? output[0] : output;
        }

        const processingTime = Date.now() - startTime;

        logger.info(`✅ Enhancement completed in ${processingTime}ms`);
        logger.info(`🖼️ Enhanced image URL:`, enhancedImageUrl);

        // Download and store the enhanced image
        const objectStorageService = new ObjectStorageService();
        const storedPath = await objectStorageService.storeEnhancedImage(
          enhancement.id,
          enhancedImageUrl as string
        );

        // Update enhancement record
        await storage.updateEnhancedImageStatus(
          enhancement.id,
          'completed',
          enhancedImageUrl as string,
          storedPath
        );

        await storage.updateEnhancedImage(enhancement.id, {
          processingTime,
        });

        logger.info(`💾 Enhanced image stored at: ${storedPath}`);

      } catch (error) {
        logger.error(`❌ Enhancement failed for ${enhancement.id}:`, error);
        await storage.updateEnhancedImageStatus(
          enhancement.id,
          'failed'
        );
        await storage.updateEnhancedImage(enhancement.id, {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info(`🎉 Batch enhancement completed: ${enhancements.length} images processed`);
  }

  // Real CivitAI API integration
  async function generateImageWithCivitAI(generationId: string, userId: string, generationData: any, userApiKey?: string) {
    try {
      logger.info(`🎨 Starting real CivitAI generation for ${generationId} (${generationData.generationType || 'txt2img'})`);
      logger.info(`🔍 Generation data:`, JSON.stringify(generationData, null, 2));
      
      // Get the model to extract the ARN
      const model = await storage.getModelById(generationData.modelId);
      if (!model || !model.arn) {
        throw new Error(`Model ${generationData.modelId} not found in storage or missing ARN. Available models should be loaded on startup.`);
      }
      logger.info(`📦 Using model: ${model.name} (${model.arn})`);

      const quantity = generationData.quantity || 1;
      logger.info(`🔍 DEBUG - Received cfgScale: ${generationData.cfgScale} (stored as int*10), quantity: ${quantity}`);
      logger.info(`🔍 DEBUG - LoRAs in generation data:`, generationData.loras?.length || 0, generationData.loras);
      
      // Convert LoRA UUIDs to CivitAI ARNs
      const lorasWithArns = [];
      const invalidLoras = [];
      if (generationData.loras && generationData.loras.length > 0) {
        for (const lora of generationData.loras) {
          const loraModel = await storage.getModelById(lora.id);
          if (loraModel && loraModel.arn) {
            lorasWithArns.push({
              id: loraModel.arn, // Use the CivitAI ARN instead of our UUID
              strength: lora.strength
            });
            logger.info(`🔄 Converted LoRA ${lora.id} to ARN: ${loraModel.arn}`);
          } else {
            invalidLoras.push(lora.id);
            logger.warn(`⚠️ LoRA model ${lora.id} not found or missing ARN - skipping`);
          }
        }
        
        if (invalidLoras.length > 0) {
          logger.warn(`⚠️ Skipped ${invalidLoras.length} invalid LoRAs: ${invalidLoras.join(', ')}`);
          logger.warn(`⚠️ This may happen after server restart - user should refresh and reselect LoRAs`);
          
          // If ALL LoRAs are invalid, continue with generation but without LoRAs
          if (invalidLoras.length === generationData.loras.length) {
            logger.warn(`⚠️ All LoRAs are invalid - continuing generation without LoRAs`);
          }
        }
      }

      // Determine whether the user pinned a specific seed
      const userPinnedSeed = generationData.seed !== null && generationData.seed !== undefined && generationData.seed !== -1;
      const baseSeed = userPinnedSeed
        ? generationData.seed
        : null; // null = generate independently per image
      const seedIncrement = generationData.seedIncrement || 1000;
      logger.info(`🎲 Seed mode: ${userPinnedSeed ? `pinned (${baseSeed})` : 'random per image'}, increment=${seedIncrement}`);

      // Use individual requests instead of batch (CivitAI batch mode is unreliable)
      logger.info(`🔍 Using individual requests: quantity=${quantity}`);
      
      const apiKey = userApiKey || process.env.CIVITAI_API_KEY;
      const civitaiService = new CivitAIService(apiKey);
      logger.info(`🔑 Using ${userApiKey ? 'user' : 'default'} API key for CivitAI generation`);

      // Sanitize once up-front — the prompt is identical across the batch (only
      // the seed changes per image). This mirrors the safety pipeline that used
      // to live inside civitaiService.generateImage: hard-block underage content,
      // then age-sanitize + apply DB positive rules, and inject + DB-rule the
      // negative prompt. The v2 submit path (submitTxt2Img) does no sanitization
      // of its own, so it MUST happen here.
      const contentCheck = civitaiService.checkForUnderageContent(generationData.prompt);
      if (contentCheck.hasViolation) {
        throw new Error(`Content policy violation detected. Generation blocked. Details: ${contentCheck.details.join('; ')}`);
      }
      let safePrompt = civitaiService.sanitizePromptAges(generationData.prompt);
      safePrompt = await civitaiService.applyPositivePromptRules(safePrompt);
      let safeNeg = civitaiService.sanitizeNegativePrompt(generationData.negativePrompt || "");
      safeNeg = await civitaiService.applyNegativePromptRules(safeNeg);

      // txt2img now submits + retrieves through the v2 workflows API
      // (operation: createImage), the same surface as img2img / img2vid. Poll
      // via getWorkflowStatus, which translates the v2 step output into the
      // legacy envelope the BatchPoller consumes.
      const pollerService = {
        getJobStatus: (t: string, k?: string) => civitaiOrchestration.getWorkflowStatus(t, k),
      };

      // Submit individual requests for each image
      for (let i = 0; i < quantity; i++) {
        // Each image gets a fully independent random seed unless the user pinned one
        // Wrap into int32 range so large increments can't overflow the DB
        // column or CivitAI's seed field.
        const imageSeed = userPinnedSeed
          ? ((baseSeed as number) + (i * seedIncrement)) % 2147483647
          : Math.floor(Math.random() * 2147483647);
        // The civitaiRequest is retained for the BatchPoller (it reads params to
        // persist generation/regeneration metadata). Carry the sanitized prompts
        // so stored metadata matches what was actually submitted.
        const civitaiRequest = {
          model: model.arn,
          baseModel: model.baseModel || undefined,
          params: {
            prompt: safePrompt,
            negativePrompt: safeNeg,
            width: generationData.width,
            height: generationData.height,
            steps: generationData.steps,
            cfgScale: generationData.cfgScale / 10,
            scheduler: generationData.scheduler || "Euler",
            clipSkip: generationData.clipSkip || 2,
            seed: imageSeed,
            loras: lorasWithArns,
          },
          generationType: generationData.generationType || "txt2img",
        };

        logger.info(`🚀 Submitting image ${i + 1}/${quantity} to CivitAI v2 workflows (seed: ${imageSeed})`);
        const submit = await civitaiOrchestration.submitTxt2Img(
          {
            prompt: safePrompt,
            negativePrompt: safeNeg,
            modelArn: model.arn,
            baseModel: model.baseModel || "",
            modelName: model.name,
            width: generationData.width,
            height: generationData.height,
            steps: generationData.steps,
            cfgScale: generationData.cfgScale / 10,
            scheduler: generationData.scheduler || "Euler",
            clipSkip: generationData.clipSkip || 2,
            seed: imageSeed,
            quantity: 1,
            loras: lorasWithArns,
          },
          userApiKey,
        );
        logger.info(`✅ Image ${i + 1}/${quantity} submitted with workflow token: ${submit.token}`);

        // Update status to processing on first image only
        if (i === 0) {
          await storage.updateGenerationStatus(generationId, "processing", undefined, submit.token);
          broadcastToUser(userId, {
            type: "generation_update",
            generationId,
            status: "processing",
            progress: 10
          });
        }

        // Poll for this image's status updates via the v2 workflows endpoint
        pollCivitAIJob(submit.token, generationId, userId, pollerService, civitaiRequest, userApiKey);
        
        // Add small delay between requests to avoid rate limiting (100ms)
        if (i < quantity - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

    } catch (error) {
      logger.error(`❌ Error generating image with CivitAI:`, error);
      
      // Log comprehensive error details to database
      await ErrorLogger.logGenerationError(
        `CivitAI image generation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : new Error(String(error)),
        userId,
        generationId,
        undefined // No req object available in this context
      ).catch(logError => {
        logger.error("Failed to log generation error:", logError);
      });
      
      await storage.updateGenerationStatus(generationId, "failed");
      const rawMsg = error instanceof Error ? error.message : "Unknown error";
      broadcastToUser(userId, {
        type: "generation_error",
        generationId,
        status: "failed",
        error: friendlyGenerationError(rawMsg)
      });
    }
  }

  // Diffus API integration for alternative provider
  async function generateImageWithDiffus(generationId: string, userId: string, generationData: any) {
    try {
      logger.info(`🎨 [Diffus] Starting generation for ${generationId}`);
      
      // Step 1: Apply hardcoded age sanitization (same as CivitAI path)
      let sanitizedPrompt = civitaiService.sanitizePromptAges(generationData.prompt);
      if (sanitizedPrompt !== generationData.prompt) {
        logger.info(`🛡️ [Diffus] Hardcoded age sanitization applied`);
      }
      
      // Step 2: Apply database-driven positive prompt rules
      const dbSanitizedPrompt = await civitaiService.applyPositivePromptRules(sanitizedPrompt);
      if (dbSanitizedPrompt !== sanitizedPrompt) {
        logger.info(`🛡️ [Diffus] Database positive prompt rules applied`);
      }
      sanitizedPrompt = dbSanitizedPrompt;
      
      // Step 3: Apply hardcoded negative prompt safety injection
      let sanitizedNegativePrompt = civitaiService.sanitizeNegativePrompt(generationData.negativePrompt || "worst quality, low quality, blurry");
      if (sanitizedNegativePrompt !== (generationData.negativePrompt || "worst quality, low quality, blurry")) {
        logger.info(`🛡️ [Diffus] Hardcoded negative prompt safety applied`);
      }
      
      // Step 4: Apply database-driven negative prompt rules  
      const dbSanitizedNegativePrompt = await civitaiService.applyNegativePromptRules(sanitizedNegativePrompt);
      if (dbSanitizedNegativePrompt !== sanitizedNegativePrompt) {
        logger.info(`🛡️ [Diffus] Database negative prompt rules applied`);
      }
      sanitizedNegativePrompt = dbSanitizedNegativePrompt;
      
      // Diffus always uses this fixed model - ignore the selected CivitAI model
      const modelName = "cyberrealisticPony_v127Alt.safetensors";
      
      const quantity = generationData.quantity || 1;
      const diffusUserPinnedSeed = generationData.seed !== null && generationData.seed !== undefined && generationData.seed !== -1;
      const diffusBaseSeed = diffusUserPinnedSeed ? generationData.seed : null;
      const diffusSeedIncrement = generationData.seedIncrement || 1000;

      logger.info(`📦 [Diffus] Using model: ${modelName}, quantity: ${quantity}, seed mode: ${diffusUserPinnedSeed ? `pinned (${diffusBaseSeed})` : 'random per image'}`);

      for (let i = 0; i < quantity; i++) {
        const imageSeed = diffusUserPinnedSeed
          ? ((diffusBaseSeed as number) + (i * diffusSeedIncrement)) % 2147483647
          : Math.floor(Math.random() * 2147483647);
        
        const diffusRequest = {
          model: modelName,
          params: {
            prompt: sanitizedPrompt,
            negativePrompt: sanitizedNegativePrompt,
            width: generationData.width,
            height: generationData.height,
            steps: generationData.steps,
            cfgScale: generationData.cfgScale / 10,
            scheduler: generationData.scheduler || "DPM++ 2M SDE",
            clipSkip: generationData.clipSkip || 2,
            seed: imageSeed,
          },
          generationType: "txt2img" as const,
          batchSize: 1,
        };

        logger.info(`🚀 [Diffus] Submitting image ${i + 1}/${quantity} (seed: ${imageSeed})`);
        
        const { taskId } = await diffusService.createGeneration(diffusRequest);
        logger.info(`✅ [Diffus] Image ${i + 1}/${quantity} submitted with taskId: ${taskId}`);

        if (i === 0) {
          await storage.updateGenerationStatus(generationId, "processing", undefined, taskId);
          broadcastToUser(userId, {
            type: "generation_update",
            generationId,
            status: "processing",
            progress: 10
          });
        }

        pollDiffusJob(taskId, generationId, userId, diffusRequest, imageSeed);
        
        if (i < quantity - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

    } catch (error) {
      logger.error(`❌ [Diffus] Error generating image:`, error);
      
      await ErrorLogger.logGenerationError(
        `Diffus image generation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : new Error(String(error)),
        userId,
        generationId,
        undefined
      ).catch(logError => {
        logger.error("Failed to log generation error:", logError);
      });
      
      await storage.updateGenerationStatus(generationId, "failed");
      const rawDiffusMsg = error instanceof Error ? error.message : "Unknown error";
      broadcastToUser(userId, {
        type: "generation_error",
        generationId,
        status: "failed",
        error: friendlyGenerationError(rawDiffusMsg)
      });
    }
  }

  // Diffus job polling function - reuses CivitAI's batch tracking system
  // Tracks processed images to handle progressive batch completion
  async function pollDiffusJob(taskId: string, generationId: string, userId: string, diffusRequest: any, seed: number) {
    const maxAttempts = 120; // 120 * 3s = 6 minute hard cap
    let attempts = 0;
    const processedImageUrls = new Set<string>(); // Track which images we've already processed
    const startTime = Date.now();
    const hardTimeoutMs = 8 * 60 * 1000; // 8 minute absolute hard cap
    
    const pollInterval = setInterval(async () => {
      attempts++;
      
      // Hard timeout check
      if (Date.now() - startTime > hardTimeoutMs) {
        clearInterval(pollInterval);
        logger.error(`❌ [Diffus] Hard timeout (8 min) for taskId: ${taskId}`);
        await storage.updateGenerationStatus(generationId, "failed");
        broadcastToUser(userId, {
          type: "generation_error",
          generationId,
          status: "failed",
          error: "Generation timed out"
        });
        return;
      }
      
      if (attempts > maxAttempts) {
        clearInterval(pollInterval);
        logger.error(`❌ [Diffus] Polling timeout for taskId: ${taskId}`);
        await storage.updateGenerationStatus(generationId, "failed");
        broadcastToUser(userId, {
          type: "generation_error",
          generationId,
          status: "failed",
          error: "Generation timed out"
        });
        return;
      }

      try {
        const status = await diffusService.checkStatus(taskId);
        
        // Process any new images that have become available
        if (status.allImages && status.allImages.length > 0) {
          for (const imageUrl of status.allImages) {
            if (!processedImageUrls.has(imageUrl)) {
              processedImageUrls.add(imageUrl);
              logger.info(`✅ [Diffus] Image ready: ${imageUrl}`);
              
              // Process each new image as it becomes available
              const result = {
                blobUrl: imageUrl,
                blobKey: undefined,
                seed: seed + processedImageUrls.size - 1 // Increment seed for each image
              };
              
              // Pass 'diffus' provider for URL-based image handling with retry
              await processIndividualImage(result, generationId, userId, diffusRequest, 'diffus');
            }
          }
        }
        
        // Send progress update based on actual image completion
        if (status.status === "processing" || (status.status === "succeeded" && !status.isComplete)) {
          const batchSize = diffusRequest.batchSize || 1;
          const imagesReady = processedImageUrls.size;
          // Calculate progress: base progress from API + image completion progress
          const apiProgress = status.progress || 0;
          const imageProgress = (imagesReady / batchSize) * 100;
          // Weight: 80% from API progress, boost when images complete
          const progress = Math.min(95, Math.max(apiProgress * 0.8, imageProgress));
          
          broadcastToUser(userId, {
            type: "generation_update",
            generationId,
            status: "processing",
            progress: Math.round(progress)
          });
        }
        
        // Only stop polling when fully complete
        if (status.isComplete && status.status === "succeeded") {
          clearInterval(pollInterval);
          logger.info(`✅ [Diffus] Batch complete: ${processedImageUrls.size} images processed`);
          
          // Send final 100% progress
          broadcastToUser(userId, {
            type: "generation_update",
            generationId,
            status: "completed",
            progress: 100
          });
        }
        
        if (status.status === "failed") {
          clearInterval(pollInterval);
          logger.error(`❌ [Diffus] Generation failed: ${status.error}`);
          await storage.updateGenerationStatus(generationId, "failed");
          broadcastToUser(userId, {
            type: "generation_error",
            generationId,
            status: "failed",
            error: status.error || "Generation failed"
          });
        }
      } catch (error) {
        logger.error(`❌ [Diffus] Polling error:`, error);
      }
    }, 3000); // Poll every 3 seconds (reduced from 2s to save compute)
  }

  // Provider router - selects between CivitAI and Diffus based on admin setting
  async function generateImageWithProvider(generationId: string, userId: string, generationData: any, userApiKey?: string) {
    try {
      const providerSetting = await storage.getPlatformSetting("image_provider");
      const provider = providerSetting?.value || "civitai";
      
      logger.info(`🔀 Using image provider: ${provider}`);
      
      if (provider === "diffus" && diffusService.isAvailable()) {
        await generateImageWithDiffus(generationId, userId, generationData);
      } else {
        if (provider === "diffus" && !diffusService.isAvailable()) {
          logger.warn(`⚠️ Diffus selected but not available (missing API key), falling back to CivitAI`);
        }
        await generateImageWithCivitAI(generationId, userId, generationData, userApiKey);
      }
    } catch (error) {
      logger.error(`❌ Provider error:`, error);
      throw error;
    }
  }

  // Process an individual video result from a transform img2vid job.
  // Stores the mp4 in object storage and updates the generation row.
  async function processIndividualVideo(result: any, originalGenerationId: string, userId: string, requestMetadata: any) {
    try {
      const original = await storage.getGeneration(originalGenerationId);
      if (!original) {
        logger.info(`🚫 Skipping video storage - generation ${originalGenerationId} deleted`);
        batchTracker.delete(originalGenerationId);
        return;
      }
      if (original.status === 'completed' && original.videoUrl) {
        logger.info(`🔄 Skipping video - generation ${originalGenerationId} already completed`);
        return;
      }

      const videoUrl: string = result.blobUrl || result.url || result.videoUrl;
      const thumbnailUrl: string | undefined = result.thumbnailUrl || result.previewUrl || original.sourceImageUrl || undefined;

      if (!videoUrl) {
        logger.error(`❌ Video result has no URL for ${originalGenerationId}`, result);
        return;
      }

      logger.info(`🎥 Storing video for ${originalGenerationId} from ${videoUrl.substring(0, 80)}...`);

      // Update the generation with the video URL immediately so the user
      // sees the result. Background persistence to object storage can run
      // best-effort afterward.
      await storage.updateGeneration(originalGenerationId, {
        videoUrl,
        videoThumbnailUrl: thumbnailUrl,
        imageUrl: thumbnailUrl || videoUrl, // for thumbnail rendering paths
        status: "completed",
        completedAt: new Date(),
      } as any);

      broadcastToUser(String(userId), {
        type: "generation_image_ready",
        generationId: originalGenerationId,
        batchId: originalGenerationId,
        imageId: originalGenerationId,
        status: "completed",
        imageUrl: thumbnailUrl || videoUrl,
        videoUrl,
        mediaType: "video",
      });

      const batchInfo = batchTracker.get(originalGenerationId);
      if (batchInfo) {
        batchInfo.completedImages = batchInfo.totalImages;
        broadcastToUser(String(userId), {
          type: "generation_batch_complete",
          generationId: originalGenerationId,
          batchId: originalGenerationId,
          status: "completed",
          totalImages: 1,
        });
        batchTracker.delete(originalGenerationId);
      }

      // Videos are not archived to object storage — CivitAI CDN URL in the DB
      // is the only reference kept. Users download directly from CivitAI.
    } catch (error) {
      logger.error('Error processing video result:', error);
    }
  }

  // New function to process individual images as they become available
  // provider: 'civitai' (blob URLs) or 'diffus' (CDN URLs with expiring tokens)
  async function processIndividualImage(result: any, originalGenerationId: string, userId: string, requestMetadata: any, provider: 'civitai' | 'diffus' = 'civitai') {
    try {
      // DELETION CHECK: Skip processing if the original generation was deleted
      const originalGeneration = await storage.getGeneration(originalGenerationId);
      if (!originalGeneration) {
        logger.info(`🚫 Skipping image storage - generation ${originalGenerationId} was deleted`);
        // Clean up batch tracker to stop polling
        batchTracker.delete(originalGenerationId);
        return;
      }
      
      // RACE CONDITION FIX: Use atomic flag from batchTracker instead of checking database
      // This prevents multiple parallel pollers from all thinking they're the "first" image
      const batchInfo = batchTracker.get(originalGenerationId);
      let isFirstImage = false;
      
      // BATCH FIX: Check if this is a batch generation that still needs more images
      const isBatchGeneration = batchInfo && batchInfo.totalImages > 1;
      const batchStillNeedsImages = isBatchGeneration && batchInfo.completedImages < batchInfo.totalImages;
      
      // ALREADY COMPLETED CHECK: Skip ONLY if:
      // 1. Original generation is completed AND
      // 2. This is NOT a batch that still needs more images (batch images should continue processing)
      if (originalGeneration.status === 'completed' && originalGeneration.imageUrl && !batchStillNeedsImages) {
        logger.info(`🔄 Skipping image - generation ${originalGenerationId} already completed with image (not a pending batch)`);
        return;
      }
      
      // RECOVERY FIX: If batchTracker doesn't have this generation (server restart scenario),
      // treat as first image if the original generation is still processing
      if (batchInfo && !batchInfo.firstImageClaimed) {
        // Atomically claim first image status (synchronous operation, no race)
        batchInfo.firstImageClaimed = true;
        isFirstImage = true;
        logger.info(`🔒 First image claimed atomically for batch ${originalGenerationId}`);
      } else if (!batchInfo && originalGeneration.status === 'processing') {
        // Recovery scenario: no tracker but original still processing - update original
        isFirstImage = true;
        logger.info(`🔒 Recovery mode: treating as first image for batch ${originalGenerationId}`);
      } else if (batchStillNeedsImages) {
        // This is an additional image in a batch - continue processing
        logger.info(`📦 Processing additional batch image ${batchInfo!.completedImages + 1}/${batchInfo!.totalImages} for ${originalGenerationId}`);
      }
      
      let generationId: string = originalGenerationId; // Always use original ID for batch tracking
      
      if (isFirstImage) {
        // Update original generation with first image
        await storage.updateGenerationStatus(originalGenerationId, "completed", result.blobUrl, result.blobKey);
        
        // SEED FIX: Update the seed value from CivitAI result for the first image
        const generation = await storage.getGeneration(originalGenerationId);
        if (generation && result.seed && generation.seed === -1) {
          // Directly update the seed if it was -1 (random)
          const updatedGeneration = { ...generation, seed: result.seed };
          // Use direct database update for the seed
          await db.update(generations)
            .set({ seed: result.seed })
            .where(eq(generations.id, originalGenerationId));
          logger.info(`🎲 Updated seed for first image from -1 to ${result.seed}`);
        }
        
        logger.info(`✅ Updated original generation ${originalGenerationId} with first image`);
      } else {
        // BATCH FIX: For additional images, we need to create separate database records
        // but track them as part of the same batch by using a batch tracking system
        const originalGeneration = await storage.getGeneration(originalGenerationId);
        if (originalGeneration) {
          // Create a new generation record but DON'T send it to frontend as a separate batch
          const additionalGeneration = await storage.createGeneration({
            modelId: originalGeneration.modelId!,
            prompt: originalGeneration.prompt,
            negativePrompt: originalGeneration.negativePrompt,
            seed: result.seed || Math.floor(Math.random() * 2147483647),
            steps: originalGeneration.steps,
            cfgScale: originalGeneration.cfgScale || 70,
            width: originalGeneration.width,
            height: originalGeneration.height,
            scheduler: originalGeneration.scheduler,
            clipSkip: originalGeneration.clipSkip,
            quantity: originalGeneration.quantity || 1, // BATCH FIX: Keep original batch quantity
            loras: originalGeneration.loras || [],
            generationType: (originalGeneration.generationType || "txt2img") as "txt2img" | "img2img",
            denoiseStrength: originalGeneration.denoiseStrength || 75,
            characterName: originalGeneration.characterName || undefined,
            sceneName: originalGeneration.sceneName || undefined,
            userId,
            batchId: originalGenerationId, // Link to parent batch for status tracking
          });
          
          await storage.updateGenerationStatus(additionalGeneration.id, "completed", result.blobUrl, result.blobKey);
          
          // CRITICAL FIX: Use the NEW generation ID so each image appears separately in recent gallery
          generationId = additionalGeneration.id;
        } else {
          logger.error('Original generation not found for additional image processing');
          return;
        }
      }
      
      // FAST DISPLAY: Send CDN URL to user immediately, store watermarked image in background
      // Step 1: Send WebSocket notification right away (user sees image ASAP via on-the-fly watermark)
      const imageReadyMessage = {
        type: "generation_image_ready",
        generationId: originalGenerationId,
        batchId: originalGenerationId,
        imageId: generationId,
        status: "completed",
        imageUrl: result.blobUrl
      };
      logger.info(`📡 FAST: Sending generation_image_ready to user ${userId}`);
      broadcastToUser(String(userId), imageReadyMessage);
      logger.info(`✅ FAST: Image ${generationId} delivered to user immediately`);
      
      // Step 2: Update batch tracker (batchInfo already declared above)
      if (batchInfo) {
        batchInfo.completedImages++;
        logger.info(`🎯 BATCH: ${batchInfo.completedImages}/${batchInfo.totalImages} images for batch ${originalGenerationId}`);
        
        if (batchInfo.completedImages >= batchInfo.totalImages) {
          logger.info(`✅ BATCH COMPLETE: All ${batchInfo.totalImages} images finished for batch ${originalGenerationId}`);
          
          const batchCompleteMessage = {
            type: "generation_batch_complete",
            generationId: originalGenerationId,
            batchId: originalGenerationId,
            status: "completed",
            totalImages: batchInfo.totalImages
          };
          broadcastToUser(userId, batchCompleteMessage);
          batchTracker.delete(originalGenerationId);

          // If the user has left (no open WebSocket), let them know via web push.
          const wsClient = clients.get(String(userId));
          if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
            const imageWord = batchInfo.totalImages === 1 ? 'image is' : `${batchInfo.totalImages} images are`;
            sendPushToUser(String(userId), {
              title: 'Your images are ready! 🎨',
              body: `Your ${imageWord} done generating. Come take a look.`,
              url: '/generate',
              tag: `batch-${originalGenerationId}`,
            }).catch((err) => logger.warn('Push send failed:', err));
          }
        }
      }
      
      // Step 3: BACKGROUND - Store watermarked image asynchronously (non-blocking)
      // User already sees image via on-the-fly watermarking from /api/images/:id endpoint
      // Note: CDN URLs don't expire (diffus.b-cdn.net has long-lived tokens), so on-the-fly watermarking is reliable fallback
      const backgroundGenerationId = generationId;
      const backgroundUserId = userId;
      const backgroundBlobUrl = result.blobUrl;
      const backgroundMetadata = requestMetadata;
      
      // Use Promise.resolve().then() for proper error handling in async context
      Promise.resolve().then(async () => {
        try {
          const objectStorageService = new ObjectStorageService();
          const generation = await storage.getGeneration(backgroundGenerationId);
          if (!generation) {
            logger.info(`⚠️ BACKGROUND: Generation ${backgroundGenerationId} not found, skipping storage`);
            return;
          }
          
          const characterName = generation.characterName;
          const sceneName = generation.sceneName;
          
          // Get user's watermark preference
          const user = await storage.getUser(backgroundUserId);
          const showWatermark = user?.showWatermark !== false;
          
          const storagePaths = await objectStorageService.storeGeneratedImageWithStructure(
            backgroundBlobUrl, 
            backgroundGenerationId, 
            characterName || undefined, 
            sceneName || undefined, 
            backgroundMetadata,
            showWatermark
          );
          
          if (storagePaths) {
            await storage.updateGenerationFileStorage(backgroundGenerationId, storagePaths.imagePath, storagePaths.metadataPath, backgroundMetadata);
            logger.info(`📁 BACKGROUND: Stored watermarked image for ${backgroundGenerationId}`);
          } else {
            logger.info(`⚠️ BACKGROUND: Storage returned null for ${backgroundGenerationId} - CDN URL preserved for on-the-fly watermark`);
          }
        } catch (bgError) {
          // Background storage failed - CDN URL is preserved in database, on-the-fly watermarking handles serving
          logger.info(`⚠️ BACKGROUND: Storage failed for ${backgroundGenerationId}: ${(bgError as Error).message} - CDN URL preserved`);
        }
      }).catch((err) => {
        // Catch any unhandled errors in the promise chain
        logger.error(`❌ BACKGROUND: Unhandled error for ${backgroundGenerationId}:`, err);
      })
      
    } catch (error) {
      logger.error('Error processing individual image:', error);
    }
  }

  // Centralized batch poller to prevent multiple polling instances
  class BatchPoller {
    activePollers = new Map<string, {
      token: string,
      users: Set<string>,
      generations: Set<string>,
      requests: Map<string, any>,
      attempts: number,
      lastProgressTime: number,
      processedImages: Set<string>,
      consecutiveEmptyResults: number,
      timeoutId?: NodeJS.Timeout,
      apiKey?: string,  // Store the API key used to create this job
      delayWarningSent?: boolean,  // Track if delay warning has been sent
      lastQueueStatus?: string,  // Latest queue position message from CivitAI serviceProviders
      resultsUnavailableSince?: number,  // When CivitAI first returned results whose blobs never became available (dead output)
      generationCreatedAtMs?: number  // Persisted createdAt of the oldest generation, so dead-output timeout survives restarts/republishes
    }>();

    async startPolling(token: string, generationId: string, userId: string, civitaiService: any, civitaiRequest: any, userApiKey?: string) {
      const existing = this.activePollers.get(token);
      
      if (existing) {
        // Add this generation to existing poller
        existing.users.add(userId);
        existing.generations.add(generationId);
        existing.requests.set(generationId, civitaiRequest);
        logger.info(`🔄 Added generation ${generationId} to existing poller for token: ${token}`);
        return;
      }

      // Create new poller for this token
      const pollerInfo = {
        token,
        users: new Set([userId]),
        generations: new Set([generationId]),
        requests: new Map([[generationId, civitaiRequest]]),
        attempts: 0,
        lastProgressTime: Date.now(),
        processedImages: new Set<string>(),
        consecutiveEmptyResults: 0,
        apiKey: userApiKey,  // CRITICAL FIX: Store the API key used to create this job
        delayWarningSent: false  // Track if we've sent the 3-minute delay warning
      };

      this.activePollers.set(token, pollerInfo);
      logger.info(`🔑 Starting poller with ${userApiKey ? 'user' : 'platform'} API key for token: ${token.substring(0, 20)}...`);
      
      // Start polling with exponential backoff
      this.scheduleNextPoll(token, civitaiService);
    }

    private scheduleNextPoll(token: string, civitaiService: any) {
      const pollerInfo = this.activePollers.get(token);
      if (!pollerInfo) return;

      // Exponential backoff with jitter
      const baseInterval = Math.min(3000 * Math.pow(1.5, Math.floor(pollerInfo.attempts / 10)), 30000);
      const jitter = Math.random() * 1000; // Add up to 1 second jitter
      const interval = baseInterval + jitter;

      pollerInfo.timeoutId = setTimeout(() => {
        this.poll(token, civitaiService);
      }, interval);
    }

    private async poll(token: string, civitaiService: any) {
      const pollerInfo = this.activePollers.get(token);
      if (!pollerInfo) return;

      try {
        pollerInfo.attempts++;
        
        // DELETION CHECK: Stop polling if all tracked generations have been deleted
        const generationIds = Array.from(pollerInfo.generations);
        const existingGenerations = await Promise.all(
          generationIds.map(id => storage.getGeneration(id))
        );
        const allDeleted = existingGenerations.every(g => !g);
        
        if (allDeleted && generationIds.length > 0) {
          logger.info(`🚫 Stopping poller - all tracked generations were deleted: ${generationIds.join(', ')}`);
          this.activePollers.delete(token);
          return;
        }
        
        // Calculate realistic progress for 2-3 minute generations (following main generation page logic)
        const timeElapsed = Date.now() - pollerInfo.lastProgressTime;
        const minutesElapsed = timeElapsed / (1000 * 60); // Convert to minutes
        
        // Conservative progress curve designed for 2-3 minute generations
        let syntheticProgress = 10; // Start at 10% baseline
        
        if (minutesElapsed >= 0.5) syntheticProgress = Math.max(syntheticProgress, 15); // 30 seconds: 15%
        if (minutesElapsed >= 1.0) syntheticProgress = Math.max(syntheticProgress, 25); // 1 minute: 25%  
        if (minutesElapsed >= 1.5) syntheticProgress = Math.max(syntheticProgress, 40); // 1.5 minutes: 40%
        if (minutesElapsed >= 2.0) syntheticProgress = Math.max(syntheticProgress, 60); // 2 minutes: 60%
        if (minutesElapsed >= 2.5) syntheticProgress = Math.max(syntheticProgress, 75); // 2.5 minutes: 75%
        if (minutesElapsed >= 3.0) syntheticProgress = Math.max(syntheticProgress, 85); // 3+ minutes: 85%
        
        // Send delay warning after 3 minutes (only once per generation)
        if (minutesElapsed >= 3.0 && !pollerInfo.delayWarningSent) {
          pollerInfo.delayWarningSent = true;
          logger.info(`⚠️ Generation delay warning sent after ${minutesElapsed.toFixed(1)} minutes`);
          for (const generationId of pollerInfo.generations) {
            for (const userId of pollerInfo.users) {
              broadcastToUser(userId, {
                type: "generation_delay_warning",
                generationId,
                message: "Still waiting on CivitAI to deliver your images. Their service may be experiencing delays. We'll keep trying."
              });
            }
          }
        }
        
        // Add small incremental progress from polling attempts (max +5%)
        const attemptBonus = Math.min(pollerInfo.attempts * 0.5, 5);
        syntheticProgress = Math.min(syntheticProgress + attemptBonus, 90); // Never exceed 90% until completion
        
        // Send progress updates for all generations being tracked by this poller
        for (const generationId of pollerInfo.generations) {
          for (const userId of pollerInfo.users) {
            broadcastToUser(userId, {
              type: "generation_update",
              generationId,
              status: "processing",
              progress: syntheticProgress,
              ...(pollerInfo.lastQueueStatus && { statusMessage: pollerInfo.lastQueueStatus }),
            });
          }
        }
        
        // Throttle logging - only log every 5th attempt to reduce noise
        if (pollerInfo.attempts % 5 === 1) {
          logger.info(`🔍 Batch polling attempt ${pollerInfo.attempts} for token: ${token.substring(0, 20)}... (${pollerInfo.generations.size} generations)`);
        }
        
        // CRITICAL FIX: Use the SAME API key that created this job
        const status = await civitaiService.getJobStatus(token, pollerInfo.apiKey);
        
        if (status.jobs && status.jobs.length > 0) {
          const job = status.jobs[0];

          // Extract queue position from full raw API response (not available via SDK)
          if (job.scheduled && job.serviceProviders) {
            const providers = Object.values(job.serviceProviders as Record<string, any>);
            for (const p of providers) {
              const qp = p?.queuePosition;
              if (qp?.estimatedStartDuration) {
                const m = (qp.estimatedStartDuration as string).match(/^(\d+):(\d+):(\d+)/);
                if (m) {
                  const hours = parseInt(m[1]);
                  const mins = parseInt(m[2]);
                  const secs = parseInt(m[3]);
                  const totalMins = hours * 60 + mins;
                  let msg: string;
                  if (totalMins > 0) {
                    msg = `⏳ Queued on CivitAI — starting in ~${totalMins}m ${secs}s`;
                  } else if (secs > 5) {
                    msg = `⏳ Queued on CivitAI — starting in ~${secs}s`;
                  } else {
                    msg = `⏳ Starting on CivitAI now…`;
                  }
                  if (pollerInfo.lastQueueStatus !== msg) {
                    pollerInfo.lastQueueStatus = msg;
                    logger.info(`⏳ Queue status for ${token.substring(0, 20)}: ${msg}`);
                  }
                  break;
                }
              }
            }
          } else if (!job.scheduled && pollerInfo.lastQueueStatus) {
            // Job has left the queue — clear the queue status message
            pollerInfo.lastQueueStatus = undefined;
          }

          if (job.result && Array.isArray(job.result) && job.result.length > 0) {
            // Primary readiness signal: CivitAI's `available === true` flag.
            // However, CivitAI's v2 orchestration endpoint (orchestration-new.civitai.com)
            // now permanently returns `available: false` even for fully deliverable images
            // with year-long signed URLs. When ALL blobs show `available: false` but carry
            // real URLs, we probe one with a HEAD request every ~10 poll cycles to check
            // whether it actually returns HTTP 200. If it does, we treat all URL-bearing
            // blobs as ready (override the flag). If it 404s, we fall through to the
            // existing dead-output timer logic — content-filtered images that never deliver.
            const isResultReady = (r: any) => r.available === true;

            // Count total vs available blobs for better tracking
            const totalBlobs = job.result.length;
            let availableBlobs = job.result.filter(isResultReady).length;

            // HEAD probe: when no blobs are flagged available but URLs are present,
            // verify the URL is actually reachable every ~10 attempts.
            if (availableBlobs === 0 && pollerInfo.attempts % 10 === 1) {
              const firstWithUrl = job.result.find((r: any) => r.blobUrl || r.url);
              const probeUrl = firstWithUrl?.blobUrl || firstWithUrl?.url;
              if (probeUrl) {
                try {
                  const headResp = await fetch(probeUrl, { method: "HEAD", signal: AbortSignal.timeout(8000) });
                  if (headResp.ok) {
                    // The URL is live — CivitAI's flag is wrong; treat all URL-bearing blobs as available.
                    logger.info(`✅ HEAD probe returned ${headResp.status} — overriding available:false for all URL-bearing blobs`);
                    job.result = job.result.map((r: any) => {
                      const hasUrl = r.blobUrl || r.url || r.videoUrl;
                      return hasUrl ? { ...r, available: true } : r;
                    });
                    availableBlobs = job.result.filter(isResultReady).length;
                  } else {
                    logger.info(`🔍 HEAD probe returned ${headResp.status} — blob URL not yet live (available:false is accurate)`);
                  }
                } catch (probeErr) {
                  logger.info(`🔍 HEAD probe failed (${probeErr instanceof Error ? probeErr.message : probeErr}) — treating as unavailable`);
                }
              }
            }

            logger.info(`📊 Blob availability: ${availableBlobs}/${totalBlobs} ready (waiting for CivitAI blob storage)`);
            
            // Debug: Log full result structure to diagnose issues
            if (availableBlobs === 0 && pollerInfo.attempts % 10 === 1) {
              logger.info(`🔬 DEBUG: Full result structure:`, JSON.stringify(job.result, null, 2));
            }

            // Dead-output terminal failure. CivitAI returns a result but the blob
            // never becomes available (available stays false and the signed URL
            // 404s). This is CivitAI silently dropping the output — most often when
            // the prompt is blocked by its content filters, or the job failed
            // server-side. Two cases:
            //   1. Job finished (scheduled:false) and produced no URL at all → fail now.
            //   2. Results present but none become available for a sustained window
            //      → the blobs are dead; fail instead of hanging until the 35m cap.
            // Window depends on whether CivitAI still reports the job as running.
            // While scheduled:true the blob may legitimately still be coming, so be
            // lenient (a stuck-scheduled job is caught by the 35m hard cap below).
            // Once scheduled:false the job is finished — a still-unavailable blob is
            // dead, so fail fast. Note: each poller handles exactly ONE result here
            // (totalBlobs === 1), so aggregate `availableBlobs === 0` == "nothing
            // deliverable". If a job ever produced >1 result and some were delivered,
            // we intentionally do NOT fast-fail (timer resets) and leave the rare
            // partial-dead case to the 35m cap rather than failing after partial delivery.
            // While scheduled:true the job is still running on CivitAI's side and
            // blobs legitimately stay `available:false` the whole time — comfy-engine
            // jobs (Krea 2 etc.) take 3+ min per image; a 4-image batch measured
            // 20+ min in production. Use a 32-min window while running (the 35-min
            // hard cap still backstops), and keep the fast 30s window once the job
            // is finished (scheduled:false) — that's the real content-filter case.
            const DEAD_OUTPUT_MS = job.scheduled ? 1_920_000 : 30_000;
            let deadOutput = false;
            let deadReason = "";
            if (availableBlobs === 0) {
              const hasAnyUrl = job.result.some((r: any) => r.blobUrl || r.url || r.videoUrl);
              if (!job.scheduled && !hasAnyUrl) {
                deadOutput = true;
                deadReason = "job finished with no output";
              } else {
                // Fast path (resets on restart, but restarts are rare): once results are
                // present, a real blob becomes available within seconds. If it stays
                // unavailable for the DEAD_OUTPUT_MS window, treat it as dead.
                if (pollerInfo.resultsUnavailableSince === undefined) {
                  pollerInfo.resultsUnavailableSince = Date.now();
                }
                const inMemoryStuck = Date.now() - pollerInfo.resultsUnavailableSince > DEAD_OUTPUT_MS;

                // Restart-proof backstop: the in-memory timer above resets every time the
                // app restarts/republishes (recovery-service re-creates pollers with fresh
                // timers). A user who republishes frequently would otherwise keep resetting
                // the clock and a dead job would hang forever. So we ALSO fail based on the
                // generation's persisted createdAt, which no restart can reset.
                // Guardrails to avoid false-failing a legitimately slow job:
                //   - Only when job.scheduled === false (job is finished, NOT still queued —
                //     CivitAI queues can legitimately run 20-30 min, and queued jobs report
                //     scheduled:true, so this never penalizes queue latency).
                //   - A generous 30-min ceiling matching the existing 35-min hard cap, well
                //     beyond any realistic queue+processing time; a finished job whose blob
                //     is still unavailable this long is dead.
                if (pollerInfo.generationCreatedAtMs === undefined) {
                  try {
                    let earliest = Date.now();
                    for (const gid of pollerInfo.generations) {
                      const g = await storage.getGeneration(gid);
                      if (g?.createdAt) earliest = Math.min(earliest, new Date(g.createdAt).getTime());
                    }
                    pollerInfo.generationCreatedAtMs = earliest;
                  } catch { pollerInfo.generationCreatedAtMs = Date.now(); }
                }
                const PERSISTENT_DEAD_MS = 30 * 60 * 1000; // 30 min from creation, survives restarts/republishes
                const persistentAge = Date.now() - (pollerInfo.generationCreatedAtMs ?? Date.now());
                const persistentStuck = job.scheduled === false && persistentAge > PERSISTENT_DEAD_MS;

                if (inMemoryStuck || persistentStuck) {
                  deadOutput = true;
                  deadReason = persistentStuck
                    ? `finished job's blobs still unavailable ${Math.round(persistentAge / 1000)}s after creation (restart-proof cap)`
                    : `blobs not available for ${Math.round((Date.now() - pollerInfo.resultsUnavailableSince) / 1000)}s (scheduled=${job.scheduled})`;
                }
              }
            } else {
              // Some blobs are genuinely available — reset the dead-output timer.
              pollerInfo.resultsUnavailableSince = undefined;
            }

            if (deadOutput) {
              logger.info(`❌ Terminal failure (dead output): ${deadReason} for token ${token.substring(0, 20)}...`);
              for (const generationId of pollerInfo.generations) {
                try {
                  await storage.updateGenerationStatus(generationId, "failed");
                  const bt = batchTracker.get(generationId) as any;
                  if (bt?.transformCost && bt?.userId) {
                    const u = await storage.getUser(bt.userId);
                    if (u) await storage.updateUserCredits(bt.userId, (u.buzzCredits || 0) + bt.transformCost);
                  }
                  if (batchTracker.has(generationId)) batchTracker.delete(generationId);
                } catch (e) { logger.error(`Failed to mark generation ${generationId} as failed:`, e); }
                for (const userId of pollerInfo.users) {
                  broadcastToUser(userId, { type: "generation_update", generationId, status: "failed", progress: 0, message: friendlyGenerationError("blobs not available — silent content filter block") });
                }
              }
              this.cleanup(token);
              return;
            }
            
            // Image results need blobUrl; video results (mp4) may expose url/videoUrl instead.
            const availableResults = job.result.filter((result: any) =>
              isResultReady(result) && (result.blobUrl || result.url || result.videoUrl)
            );
            
            // Process new images
            for (const result of availableResults) {
              const imageKey = result.blobKey || result.blobUrl || result.url || result.videoUrl;
              if (!pollerInfo.processedImages.has(imageKey)) {
                // Process image (or video) for each generation
                let processedOk = false;
                for (const generationId of pollerInfo.generations) {
                  const civitaiRequest = pollerInfo.requests.get(generationId);
                  if (civitaiRequest) {
                    try {
                      const isVideo = civitaiRequest.mediaType === 'video' || result.mediaType === 'video';
                      if (isVideo) {
                        await processIndividualVideo(result, generationId, Array.from(pollerInfo.users)[0], civitaiRequest);
                      } else {
                        await processIndividualImage(result, generationId, Array.from(pollerInfo.users)[0], civitaiRequest, 'civitai');
                      }
                      processedOk = true;
                    } catch (imageError) {
                      logger.error(`❌ Failed to process result for generation ${generationId}:`, imageError);
                    }
                  }
                }
                // Only mark the blob as processed once it actually persisted. On a
                // transient download/store failure we leave it unmarked so a later
                // poll retries, instead of permanently dropping the image and
                // marking the batch "complete" with nothing stored.
                if (processedOk) {
                  pollerInfo.processedImages.add(imageKey);
                  pollerInfo.lastProgressTime = Date.now();
                }
              }
            }
            
            // Check if job is complete — every ready result must have been
            // successfully processed (not just returned by CivitAI).
            const allResultsProcessed =
              availableResults.length === job.result.length &&
              availableResults.length > 0 &&
              availableResults.every((r: any) =>
                pollerInfo.processedImages.has(r.blobKey || r.blobUrl || r.url || r.videoUrl)
              );
            if (allResultsProcessed) {
              logger.info(`✅ Batch poller completed for token: ${token.substring(0, 20)}...`);
              
              // CRITICAL FIX: Only send 100% progress when ALL images in the batch are complete
              // Each poller handles 1 image, so we need to check the batch tracker
              // to see if this was the final image in the batch
              for (const generationId of pollerInfo.generations) {
                const batchInfo = batchTracker.get(generationId);
                const allBatchImagesComplete = !batchInfo || batchInfo.completedImages >= batchInfo.totalImages;
                
                if (allBatchImagesComplete) {
                  // All images done - send 100% to close the progress UI
                  for (const userId of pollerInfo.users) {
                    broadcastToUser(userId, {
                      type: "generation_update",
                      generationId,
                      status: "processing",
                      progress: 100
                    });
                    logger.info(`📡 Sent final 100% progress for generation: ${generationId} (all ${batchInfo?.totalImages || 1} images complete)`);
                  }
                } else {
                  // More images still pending - don't send 100% yet
                  logger.info(`⏳ Poller done but batch not complete: ${batchInfo.completedImages}/${batchInfo.totalImages} for ${generationId}`);
                }
              }
              
              this.cleanup(token);
              return;
            }
          }
          
          // Reset empty results counter when we have results
          pollerInfo.consecutiveEmptyResults = 0;
        } else if (status.jobs && status.jobs[0] && status.jobs[0].scheduled === false && !status.jobs[0].result) {
          // CRITICAL FIX: Detect terminal failure - job not scheduled but has no results
          pollerInfo.consecutiveEmptyResults++;
          logger.info(`⚠️ Job has scheduled:false but no results (${pollerInfo.consecutiveEmptyResults} consecutive empty responses)`);
          
          // After 10 consecutive empty results, mark as terminal failure
          if (pollerInfo.consecutiveEmptyResults >= 10) {
            logger.info(`❌ Terminal failure detected: Job has scheduled:false with no results after ${pollerInfo.consecutiveEmptyResults} attempts`);
            
            // Mark all generations as failed in database
            for (const generationId of pollerInfo.generations) {
              try {
                await storage.updateGenerationStatus(generationId, "failed");
                logger.info(`✅ Marked generation ${generationId} as failed in database (terminal empty result)`);
                
                // Refund credits for transform jobs whose tracker carries a cost.
                const bt = batchTracker.get(generationId) as any;
                if (bt?.transformCost && bt?.userId) {
                  try {
                    const u = await storage.getUser(bt.userId);
                    if (u) await storage.updateUserCredits(bt.userId, (u.buzzCredits || 0) + bt.transformCost);
                    logger.info(`💰 Refunded ${bt.transformCost} Buzz to ${bt.userId} (terminal empty)`);
                  } catch (rfErr) { logger.error("Refund failed:", rfErr); }
                }

                // Clean up batch tracker
                if (batchTracker.has(generationId)) {
                  batchTracker.delete(generationId);
                  logger.info(`🧹 Cleaned up batch tracker for ${generationId}`);
                }
              } catch (dbError) {
                logger.error(`❌ Failed to update database for generation ${generationId}:`, dbError);
              }
              
              // Notify user
              for (const userId of pollerInfo.users) {
                broadcastToUser(userId, {
                  type: "generation_update",
                  generationId,
                  status: "failed",
                  progress: 0,
                  message: "Generation failed - CivitAI returned no results"
                });
              }
            }
            
            this.cleanup(token);
            return;
          }
        } else {
          // Reset counter if we get any other status
          pollerInfo.consecutiveEmptyResults = 0;
        }

        // Check timeout conditions - CivitAI queues can be 20-30 min during peak load
        const maxAttempts = 240; // ~40 min with exponential backoff
        const maxStuckTime = 35 * 60 * 1000; // 35 minutes hard cap
        const retryStuckTime = 15 * 60 * 1000; // Log a warning after 15 minutes in queue
        const timeSinceProgress = Date.now() - pollerInfo.lastProgressTime;

        // Check if job is stuck in "scheduled" state for too long
        if (timeSinceProgress > retryStuckTime && status.jobs && status.jobs[0] && status.jobs[0].scheduled === true) {
          logger.info(`⏰ Job stuck in scheduled state for ${Math.floor(timeSinceProgress/1000/60)} minutes - will timeout if it continues`);
          // Let it continue to the final timeout check below
        }

        // Final timeout - give up completely
        if (pollerInfo.attempts >= maxAttempts || timeSinceProgress > maxStuckTime) {
          logger.info(`❌ Batch poller final timeout for token: ${token.substring(0, 20)}... (${pollerInfo.attempts} attempts, ${Math.floor(timeSinceProgress/1000/60)} minutes)`);
          
          // CRITICAL FIX: Update database to mark generations as failed
          for (const generationId of pollerInfo.generations) {
            try {
              await storage.updateGenerationStatus(generationId, "failed");
              logger.info(`✅ Marked generation ${generationId} as failed in database`);

              // Refund credits for transform jobs whose tracker carries a cost.
              const bt = batchTracker.get(generationId) as any;
              if (bt?.transformCost && bt?.userId) {
                try {
                  const u = await storage.getUser(bt.userId);
                  if (u) await storage.updateUserCredits(bt.userId, (u.buzzCredits || 0) + bt.transformCost);
                  logger.info(`💰 Refunded ${bt.transformCost} Buzz to ${bt.userId} (final timeout)`);
                } catch (rfErr) { logger.error("Refund failed:", rfErr); }
              }

              // Clean up batch tracker to prevent orphaned tracking
              if (batchTracker.has(generationId)) {
                batchTracker.delete(generationId);
                logger.info(`🧹 Cleaned up batch tracker for ${generationId}`);
              }
            } catch (dbError) {
              logger.error(`❌ Failed to update database for generation ${generationId}:`, dbError);
            }
            
            // Notify user of final failure
            for (const userId of pollerInfo.users) {
              broadcastToUser(userId, {
                type: "generation_update",
                generationId,
                status: "failed",
                progress: 0,
                message: "Generation failed after multiple attempts - please try again later"
              });
            }
          }
          
          this.cleanup(token);
          return;
        }

        // Schedule next poll (API key is stored in pollerInfo)
        this.scheduleNextPoll(token, civitaiService);

      } catch (error: any) {
        logger.error(`❌ Batch poller error for token ${token.substring(0, 20)}...:`, error);

        // If CivitAI says the token is permanently invalid, mark the generation
        // as failed in the DB immediately so it won't be recovered on restart.
        const isInvalidToken =
          error?.status === 400 &&
          (error?.body?.token?.includes('Token is invalid') ||
           String(error?.body?.token) === 'Token is invalid');

        if (isInvalidToken) {
          const pollerInfo = this.activePollers.get(token);
          if (pollerInfo) {
            for (const generationId of pollerInfo.generations) {
              try {
                await storage.updateGenerationStatus(generationId, 'failed');
                logger.info(`🗑️ Marked generation ${generationId} as failed (token invalid)`);
              } catch (dbErr) {
                logger.error(`Failed to mark ${generationId} as failed:`, dbErr);
              }
            }
          }
        }

        this.cleanup(token);
      }
    }

    private cleanup(token: string) {
      const pollerInfo = this.activePollers.get(token);
      if (pollerInfo && pollerInfo.timeoutId) {
        clearTimeout(pollerInfo.timeoutId);
      }
      this.activePollers.delete(token);
    }

    // Forcefully cleanup ALL active pollers (for debugging/reset)
    cleanupAll() {
      logger.info(`🧹 Forcefully cleaning up ${this.activePollers.size} active pollers`);
      for (const [token, pollerInfo] of this.activePollers.entries()) {
        if (pollerInfo.timeoutId) {
          clearTimeout(pollerInfo.timeoutId);
        }
      }
      this.activePollers.clear();
      logger.info(`✅ All pollers cleaned up`);
    }

    // Get count of active pollers (for debugging)
    getActiveCount() {
      return this.activePollers.size;
    }
  }

  const batchPoller = new BatchPoller();

  async function pollCivitAIJob(token: string, generationId: string, userId: string, civitaiService: any, civitaiRequest: any, userApiKey?: string) {
    // Use the centralized batch poller to prevent multiple polling instances
    return await batchPoller.startPolling(token, generationId, userId, civitaiService, civitaiRequest, userApiKey);

  }


export {
  processEnhancements,
  generateImageWithCivitAI,
  generateImageWithDiffus,
  pollDiffusJob,
  generateImageWithProvider,
  processIndividualVideo,
  processIndividualImage,
  BatchPoller,
  batchPoller,
  pollCivitAIJob,
};
