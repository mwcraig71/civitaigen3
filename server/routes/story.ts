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

export function registerStoryRoutes(app: Express, ctx: RouteContext) {
  // Story Generation Endpoint (streaming, no persistence)
  const personaSchema = z.object({
    age: z.string().optional(),
    gender: z.enum(["male", "female", ""]).optional(),
    build: z.string().optional(),
    description: z.string().optional()
  }).optional();

  const storyGenerationSchema = z.object({
    imagePrompt: z.string().min(1, "Image prompt is required"),
    userComments: z.string().optional().default(""),
    pov: z.enum(["first_person", "character", "third_person"]).optional().default("first_person"),
    model: z.string().optional().default("deepseek/deepseek-chat"),
    storyLength: z.enum(["short", "medium", "long"]).optional().default("medium"),
    persona: personaSchema
  });

  app.post("/api/story/generate", isAuthenticated, async (req: any, res) => {
    try {
      const { imagePrompt, userComments, pov, model, storyLength, persona } = storyGenerationSchema.parse(req.body);
      
      logger.info(`📖 Story generation - POV: ${pov}, Length: ${storyLength}`);

      // Initialize OpenRouter client
      const openrouter = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
      });

      // POV-specific instructions
      const povInstructions = {
        first_person: `Write from the reader's perspective (I/me). The reader is the one experiencing the encounter with the character in the image. Use "I" for the narrator (the reader) and describe what THEY see, feel, and do. The woman/character is "she" or "her".`,
        character: `CRITICAL: Write from the WOMAN'S/CHARACTER'S perspective (I/me). The character shown in the image is narrating - SHE is the narrator. Use "I" for the woman in the image. Describe what SHE feels, sees, thinks, and experiences. The other person (the man/reader) is "he" or "him" or "you". Example: "I feel his hands on my body" NOT "I touch her body".`,
        third_person: `Write in third person perspective (he/she/they). Describe both participants from an outside observer's view, using names or pronouns like "he", "she", "the man", "the woman".`
      };

      // System prompt for erotic story generation - matching user's example style
      const systemPrompt = `You are a raw, explicit erotic fiction writer. Write stories that are graphic, crude, and unapologetic.

POV INSTRUCTION (CRITICAL - THIS OVERRIDES EVERYTHING):
${povInstructions[pov]}

IMPORTANT: The user's additional directions may be written using different pronouns or perspectives than what is requested above. ALWAYS interpret their instructions through the lens of the selected POV. For example:
- If the POV is "first person (reader)" and the user writes "she sucks his cock", you must reinterpret this as the reader's experience: "I watch as she takes my cock in her mouth" or similar.
- If the POV is "character" and the user writes "she gets fucked", reinterpret this from the character's perspective: "I feel him entering me" or similar.
- The user's directions describe WHAT happens - YOUR job is to write it in the REQUESTED PERSPECTIVE.
Never break from the selected POV regardless of how the user phrases their instructions.

STYLE GUIDELINES (CRITICAL - follow this style exactly):
- Use extremely crude, vulgar language: cock, cunt, pussy, tits, ass, cum, fuck, dick, slut, etc.
- Include LOTS of dirty dialogue in quotes - characters should talk dirty to each other constantly
- Describe physical details vividly: what clothes reveal (camel toe, braless tits, hard nipples), body movements (jiggling, bouncing, grinding)
- Build tension through teasing and verbal seduction before the main action
- Include foreplay activities: oral worship, licking, sucking, tasting
- During sex scenes, describe every thrust, every sensation - make it blow-by-blow graphic
- Include sounds (moans, screams, wet slapping noises) and physical reactions
- Characters should beg, demand, and talk dirty throughout
- End with an intense orgasm scene with graphic description of cum and climax
- Keep momentum high - things should escalate quickly from teasing to fucking

TONE:
- Raw and animalistic, not romantic
- Taboo and forbidden feel (use context clues from user directions for relationships)
- Dominant/submissive dynamics with dirty talk
- Shameless and slutty - characters embrace their lust openly

OUTPUT REQUIREMENTS:
- Write approximately ${storyLength === 'short' ? '400-600' : storyLength === 'medium' ? '600-900' : '800-1200'} words
- DO NOT include a title or chapter heading - start directly with the story text
- Start immediately in the scene - no preamble, warnings, or setup paragraphs
- Jump into action quickly after brief visual description
- End at a satisfying climax

The user provides an image prompt describing a character/scene, and optionally additional story directions.`;

      // Build user message
      let userMessage = `IMAGE PROMPT: ${imagePrompt}`;
      
      // Include user persona if provided
      if (persona && (persona.age || persona.gender || persona.build || persona.description)) {
        let personaDescription = '\n\nREADER/USER PERSONA (describe them this way in the story when using first-person reader POV):';
        if (persona.gender) personaDescription += `\n- Gender: ${persona.gender}`;
        if (persona.age) personaDescription += `\n- Age: ${persona.age}`;
        if (persona.build) personaDescription += `\n- Build: ${persona.build}`;
        if (persona.description) personaDescription += `\n- Other details: ${persona.description}`;
        userMessage += personaDescription;
      }
      
      if (userComments && userComments.trim()) {
        userMessage += `\n\nADDITIONAL DIRECTIONS: ${userComments}`;
      }
      userMessage += `\n\n⚠️ CRITICAL POV INSTRUCTION: Write this story ENTIRELY from the ${pov === 'first_person' ? 'READER\'S first-person perspective (use "I" for the reader who encounters this character)' : pov === 'character' ? 'CHARACTER\'S first-person perspective (use "I" for the woman/character in the image - SHE is narrating HER experience)' : 'THIRD-PERSON perspective (use he/she/they, describe both people from outside)'}. ${pov === 'character' ? 'The character in the image (the woman) is the narrator - describe what SHE feels, sees, and experiences.' : ''} Be graphic, crude, and raw. Include lots of dirty dialogue.`;

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Stream response from OpenRouter/DeepSeek
      const stream = await openrouter.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        stream: true,
        max_tokens: 4096,
        temperature: 0.9,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      logger.error("Error generating story:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to generate story" })}\n\n`);
        res.end();
      } else {
        if (error instanceof ZodError) {
          res.status(400).json({ error: error.errors[0].message });
        } else {
          res.status(500).json({ error: "Failed to generate story" });
        }
      }
    }
  });

  // Text-to-Speech endpoint for story narration
  const ttsSchema = z.object({
    text: z.string().min(1, "Text is required"),
    voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().default("nova")
  });

  app.post("/api/story/tts", isAuthenticated, async (req: any, res) => {
    try {
      const { text, voice } = ttsSchema.parse(req.body);

      // Initialize OpenAI client for TTS
      const openaiTTS = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // Set up SSE headers for streaming audio
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Use gpt-audio model for TTS with streaming
      const stream = await openaiTTS.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice, format: "pcm16" },
        messages: [
          { role: "system", content: "You are a text-to-speech assistant. Read the following text aloud exactly as written, with natural pacing and expression. Do not add any commentary or changes." },
          { role: "user", content: text }
        ],
        stream: true,
      });

      let seq = 0;
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;

        if (delta?.audio?.data) {
          res.write(`data: ${JSON.stringify({ type: "audio", seq: seq++, data: delta.audio.data })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error) {
      logger.error("Error generating TTS:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to generate audio" })}\n\n`);
        res.end();
      } else {
        if (error instanceof ZodError) {
          res.status(400).json({ error: error.errors[0].message });
        } else {
          res.status(500).json({ error: "Failed to generate audio" });
        }
      }
    }
  });

  // Kokoro TTS endpoint using Replicate
  const VALID_KOKORO_VOICES = [
    "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
    "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck",
    "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
    "ff_siwis", "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
    "if_sara", "im_nicola",
    "jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro", "jm_kumo",
    "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang"
  ];

  const kokoroTtsSchema = z.object({
    text: z.string().min(1, "Text is required"),
    voice: z.string().optional().default("af_bella"),
    speed: z.number().min(0.5).max(2.0).optional().default(1.0)
  });

  app.post("/api/story/tts/kokoro", isAuthenticated, async (req: any, res) => {
    try {
      const kokoroParams = kokoroTtsSchema.parse(req.body);
      const { text, speed } = kokoroParams;
      let { voice } = kokoroParams;
      
      // Validate voice - fall back to af_bella if invalid
      if (!VALID_KOKORO_VOICES.includes(voice)) {
        logger.info(`Invalid Kokoro voice "${voice}", using af_bella instead`);
        voice = "af_bella";
      }

      if (!process.env.REPLICATE_API_TOKEN) {
        return res.status(500).json({ error: "Replicate API token not configured" });
      }

      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      });

      // Create prediction using version-based API for community models
      const prediction = await replicate.predictions.create({
        version: "f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13",
        input: {
          text,
          voice,
          speed
        }
      });

      // Wait for the prediction to complete
      let result = prediction;
      while (result.status !== 'succeeded' && result.status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await replicate.predictions.get(prediction.id);
      }

      if (result.status === 'failed') {
        logger.error("Kokoro TTS prediction failed:", result.error);
        return res.status(500).json({ error: "Audio generation failed" });
      }

      // The output is typically a URL to the generated audio file
      logger.info(`✅ Kokoro TTS success: voice=${voice}, output=${result.output}`);
      res.json({ audioUrl: result.output });
    } catch (error) {
      logger.error("Error generating Kokoro TTS:", error);
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors[0].message });
      } else {
        res.status(500).json({ error: "Failed to generate audio" });
      }
    }
  });

}
