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
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import { ZodError, z } from "zod";
import { setupAuth, isAuthenticated } from "../googleAuth";
import multer from "multer";
import Replicate from "replicate";
import { responseCache, CACHE_TTL, createCacheKey } from "../cache";
import { getCleanupStats, runImageCleanup, RETENTION_POLICY } from "../image-cleanup-service";
import OpenAI from "openai";
import { apiV1Router, generateApiKey, hashApiKey, hashBotPassword, setGenerateImageHandler, setBatchTracker, setSubmitTransformHandler } from "../api-v1";

const insertBulkShareImageSchema = z.object({
  generationIds: z.array(z.string()).min(1, "At least one generation ID is required")
});

const insertBulkCharacterUpdateSchema = z.object({
  generationIds: z.array(z.string()).min(1, "At least one generation ID is required"),
  characterName: z.string().min(1, "Character name is required").max(100, "Character name too long"),
  characterId: z.string().optional()
});

interface GenerationJob {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
}

const activeJobs = new Map<string, GenerationJob>();
const clients = new Map<string, WebSocket>();

// Initialize Stripe (optional for development)
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16" as any,
  });
}

  // BATCH FIX: Track batch completion across multiple individual jobs
  // firstImageClaimed: boolean - prevents race condition where multiple pollers try to claim "first image" status
  const batchTracker = new Map<string, { totalImages: number, completedImages: number, userId: string, firstImageClaimed: boolean }>(); // Maps generationId -> batch info

  // Utility function to broadcast to specific user
  function broadcastToUser(userId: string, message: any) {
    const userIdStr = String(userId); // Ensure string type
    const client = clients.get(userIdStr);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    } else {
      logger.warn(`⚠️ Failed to broadcast ${message.type} to user ${userIdStr}: ${!client ? 'no client found' : 'client not open'}`);
    }
  }

  // Helper function to convert CFG scale for API responses and serve object storage URLs
  function convertGenerationForResponse(generation: any) {
    // If generation has stored image path, use object storage URL instead of blob URL
    let imageUrl = generation.imageUrl;
    if (generation.storedImagePath) {
      // Create permanent URL that serves from object storage
      imageUrl = `/api/images/${generation.id}`;
    }
    
    return {
      ...generation,
      imageUrl,
      cfgScale: generation.cfgScale / 10,
      loras: generation.loras || [], // Ensure LoRAs are preserved in response
    };
  }

  function convertGenerationsForResponse(generations: any[]) {
    return generations.map(convertGenerationForResponse);
  }

  // Helper function to convert user data for frontend consumption
  function convertUserForResponse(user: any) {
    if (!user) return user;
    
    return {
      ...user,
      // Convert storage path to viewable URL for profile images
      profileImageUrl: user.profileImage ? `/api/user-images/${user.id}` : null,
    };
  }

export { eq, and };

export {
  insertBulkShareImageSchema,
  insertBulkCharacterUpdateSchema,
  activeJobs,
  clients,
  stripe,
  batchTracker,
  broadcastToUser,
  convertGenerationForResponse,
  convertGenerationsForResponse,
  convertUserForResponse,
};

export interface RouteContext {
  objectStorage: ObjectStorageService;
  objectStorageService: ObjectStorageService;
  geminiService: GeminiService;
}
