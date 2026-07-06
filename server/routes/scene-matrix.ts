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

export function registerSceneMatrixRoutes(app: Express, ctx: RouteContext) {
  const { objectStorageService } = ctx;

  // Upload custom words for a Scene Matrix category
  app.post("/api/scene-matrix/upload", async (req, res) => {
    try {
      const { category, subcategory, content } = req.body;
      
      if (!category || !subcategory || !content) {
        return res.status(400).json({ error: "Category, subcategory, and content are required" });
      }

      const filename = `${category}-${subcategory}.txt`;
      
      // Parse new words from content
      const newWords = content.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      
      if (newWords.length === 0) {
        return res.status(400).json({ error: "No valid words found in content" });
      }
      
      // Get existing custom words if any
      let existingWords: string[] = [];
      try {
        const existingContent = await objectStorageService.downloadTextFile(filename);
        existingWords = existingContent.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
      } catch (error) {
        // File doesn't exist yet, which is fine
        logger.info(`No existing file for ${filename}, creating new one`);
      }
      
      // Combine existing and new words, removing duplicates
      const allWords = Array.from(new Set([...existingWords, ...newWords]));
      const finalContent = allWords.join('\n');
      
      await objectStorageService.uploadTextFile(filename, finalContent);
      
      logger.info(`📝 Uploaded ${newWords.length} new words to ${filename}. Total words: ${allWords.length}`);
      
      res.json({ 
        success: true, 
        message: `Custom words for ${category}/${subcategory} uploaded successfully`,
        filename,
        newWordsCount: newWords.length,
        totalWordsCount: allWords.length
      });
    } catch (error) {
      logger.error("Error uploading scene matrix file:", error);
      res.status(500).json({ error: "Failed to upload custom words" });
    }
  });

  // Download words for a Scene Matrix category
  app.get("/api/scene-matrix/download/:category/:subcategory", async (req, res) => {
    try {
      const { category, subcategory } = req.params;
      const filename = `${category}-${subcategory}.txt`;
      
      try {
        const content = await objectStorageService.downloadTextFile(filename);
        
        // Set headers for file download
        res.set({
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        
        res.send(content);
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.status(404).json({ error: "Custom words file not found for this category" });
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error downloading scene matrix file:", error);
      res.status(500).json({ error: "Failed to download words file" });
    }
  });

  // Get custom words for a Scene Matrix category (for display in UI)
  app.get("/api/scene-matrix/custom/:category/:subcategory", async (req, res) => {
    try {
      const { category, subcategory } = req.params;
      const filename = `${category}-${subcategory}.txt`;
      
      try {
        const content = await objectStorageService.downloadTextFile(filename);
        const words = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        res.json({ words });
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.json({ words: [] }); // Return empty array if no custom words exist
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error fetching custom scene matrix words:", error);
      res.status(500).json({ error: "Failed to fetch custom words" });
    }
  });

}
