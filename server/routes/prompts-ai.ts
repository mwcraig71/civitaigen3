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
import { batchPoller } from "./generation-pipeline";

export function registerPromptsAiRoutes(app: Express, ctx: RouteContext) {
  const { geminiService } = ctx;
  // AI Prompt Enhancement (no auth required for demo)
  app.post("/api/ai-enhance-prompt", async (req, res) => {
    try {
      logger.info('📨 AI Enhancement request received:', {
        body: req.body,
        headers: req.headers['content-type']
      });

      const request: AIPromptRequest = req.body;

      // Look up the user's persistent AI prompt instructions + self-learned
      // taste profile (if signed in).
      let userInstructions: string | undefined;
      let userId: string | undefined;
      let existingProfile: any = null;
      try {
        userId = (req as any).user?.claims?.sub || (req as any).user?.id;
        if (userId) {
          const u = await storage.getUser(userId);
          if (u?.aiPromptInstructions && u.aiPromptInstructions.trim()) {
            userInstructions = u.aiPromptInstructions.trim();
          }
          existingProfile = u?.learnedStyleProfile ?? null;
        }
      } catch (e) {
        logger.warn('⚠️ Could not load user AI prefs:', e);
      }
      request.userInstructions = userInstructions;
      // Enhancement uses the profile as it stands BEFORE this press; the new
      // learning from this prompt takes effect on the next enhance.
      request.learnedProfile = existingProfile;

      logger.info('🤖 AI Prompt Enhancement request:', {
        hasCharacter: !!request.characterData,
        hasScene: !!request.sceneData,
        currentPrompt: request.currentPrompt?.substring(0, 50) + '...',
        contentRating: request.contentRating,
        hasUserInstructions: !!userInstructions,
        hasLearnedProfile: !!existingProfile,
      });

      // Run the enhancement and the self-learning update in parallel. The
      // learning step never throws, so it can't break enhancement.
      const [result, updatedProfile] = await Promise.all([
        geminiService.generateEnhancedPrompt(request),
        geminiService.updateLearnedProfile(request.currentPrompt || '', existingProfile),
      ]);

      // Persist the freshly learned profile for signed-in users.
      if (userId && updatedProfile) {
        try {
          await storage.updateUser(userId, { learnedStyleProfile: updatedProfile } as any);
          logger.info('🧠 Updated learned style profile:', {
            enhanceCount: updatedProfile.enhanceCount,
            styles: updatedProfile.styles.length,
            physicalAttributes: updatedProfile.physicalAttributes.length,
          });
        } catch (e) {
          logger.warn('⚠️ Could not save learned style profile:', e);
        }
      }
      
      logger.info('✅ AI Enhancement completed:', {
        enhancedLength: result.enhancedPrompt.length,
        negativeLength: result.negativePrompt.length,
        explanation: result.explanation
      });
      
      res.json(result);
    } catch (error) {
      logger.error("❌ Error enhancing prompt with AI:", error);
      res.status(500).json({ 
        message: "Failed to enhance prompt",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Reset the self-learned style profile for the signed-in user.
  app.delete('/api/user/style-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.updateUser(userId, { learnedStyleProfile: null } as any);
      res.json({ success: true });
    } catch (error) {
      logger.error("❌ Error resetting learned style profile:", error);
      res.status(500).json({ message: "Failed to reset learned style profile" });
    }
  });

  // Generate AI Prompts from Traits
  app.post("/api/generate-prompts", async (req, res) => {
    try {
      const { traits, creativeFlair } = req.body;
      
      logger.info('🎨 Prompt generation request:', {
        traitsCount: traits?.length || 0,
        creativeFlair
      });

      if (!traits || !Array.isArray(traits) || traits.length === 0) {
        return res.status(400).json({ 
          message: "Please provide at least one trait" 
        });
      }

      let masterPrompt = `You are an AI assistant that specializes in creating high-quality, effective prompts for the PONY image generation model. Your task is to take a list of user-selected traits for a female character and generate a JSON array of 10 diverse, detailed, and evocative prompts, each approximately 100 words long.

**RULES:**
1.  **Creative Extrapolation:** You MUST take creative liberty. For any trait categories the user has NOT selected (e.g., hair style, eye color, skin details), you must intelligently extrapolate and add fitting details based on the traits that WERE provided. Create a complete, vivid portrait of the character in each prompt. The goal is to provide rich, varied descriptions that go beyond the user's simple inputs.
2.  **Realism and Imperfection:** ALWAYS include small, natural imperfections to enhance realism. These can include details like beauty marks, moles, faint scars, flyaway hairs, hair stubble, uneven skin tone, or slightly asymmetrical features. Distribute these imperfections logically across the 10 prompts.
3.  **Varied Appearance:** DO NOT assume every character should be conventionally beautiful. Actively create a range of appearances. Some prompts should describe characters who are more "homely," "nerdy," or "average-looking" rather than idealized models. This variety is crucial.
4.  **PONY Optimization:** All prompts must start with quality tags like \`score_9, score_8_up, source_photo, absurdres, real_beauty,\` or \`score_9, source_anime,\`.
5.  **Focus on Subject:** Prompts must only describe the female character.
6.  **Outfit Selection:** If an outfit is provided in the traits, describe it. If an outfit is NOT provided, you MUST creatively select and describe one that fits the character's overall aesthetic.
7.  **Lighting Selection:** If a lighting style is provided in the traits, use it. If not, you MUST creatively choose and describe a lighting scenario that enhances the mood of the character and outfit.
8.  **Strict Exclusions:** Absolutely DO NOT include any background/scene information (e.g., \`in a forest\`, \`cityscape background\`).
9.  **Trait Order:** Arrange descriptive traits logically, starting with the overall physique and ending with the facial expression. The prompt must include the term "close_up" just before the expression itself. The expression must always be one of the last traits mentioned.
10. **Diversity:** The 10 prompts must be unique. Vary the phrasing, your creative extrapolations, and the character's overall aesthetic to give the user a range of creative options.
11. **Output Format:** The final output must be a single, clean JSON array of strings, with nothing before or after it.`;

      if (creativeFlair) {
        masterPrompt += `\n12. **Creative Flair:** Since the user requested it, add a touch of surrealism, fantasy, or unexpected artistic elements to each prompt to make them more unique and imaginative.`;
      }

      masterPrompt += `\n\n**User Input Traits:**
\`[${traits.join(', ')}]\`

Generate the JSON array now.`;

      // Use Gemini API to generate prompts
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: masterPrompt }] }]
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json();
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Could not extract JSON from response");
      }

      const prompts = JSON.parse(jsonMatch[0]);
      
      logger.info('✅ Prompts generated:', prompts.length);
      
      res.json({ prompts });
    } catch (error) {
      logger.error("❌ Error generating prompts:", error);
      res.status(500).json({ 
        message: "Failed to generate prompts",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // CRITICAL: Clear All stuck generations endpoint
  app.post("/api/pollers/cleanup-all", async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      logger.info('🛑 User requested cleanup of all pollers and stuck generations');
      
      // 1. Kill ALL active pollers
      const cleaned = batchPoller.cleanupAll();
      logger.info(`🧹 Killed ${cleaned} active polling loops`);
      
      // 2. Cancel ALL processing generations in database
      const dbResult = await db
        .update(generations)
        .set({ status: 'cancelled' })
        .where(and(
          eq(generations.userId, userId),
          eq(generations.status, 'processing')
        ))
        .returning({ id: generations.id });
      
      logger.info(`🗑️ Cancelled ${dbResult.length} stuck generations in database`);
      
      res.json({ 
        success: true, 
        cleaned, 
        cancelledGenerations: dbResult.length,
        message: `Cleaned up ${cleaned} pollers and cancelled ${dbResult.length} stuck generations`
      });
    } catch (error) {
      logger.error('❌ Error cleaning up pollers:', error);
      res.status(500).json({ message: "Failed to cleanup pollers" });
    }
  });

  // Get poller status
  app.get("/api/pollers/status", async (req, res) => {
    try {
      const activeCount = batchPoller.activePollers.size;
      res.json({ activePollers: activeCount });
    } catch (error) {
      res.status(500).json({ message: "Failed to get poller status" });
    }
  });

  app.post("/api/users/:id/unfollow", async (req, res) => {
    try {
      res.json({ success: true, message: "User unfollowed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });

  // Update user profile
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = id === "me" ? (req.user as any)?.claims?.sub : id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // For now just return success - would need to implement updateUser in storage
      res.json({ success: true, message: "Profile updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

}
