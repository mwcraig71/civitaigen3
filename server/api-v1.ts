import { Router, Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "./storage";
import { civitaiService, CivitAIService } from "./civitai-service";
import { civitaiOrchestration } from "./civitai-orchestration";
import { insertGenerationSchema } from "@shared/schema";
import OpenAI from "openai";
import Replicate from "replicate";

declare global {
  namespace Express {
    interface Request {
      apiKeyUserId?: string;
      apiKeyId?: string;
    }
  }
}

const router = Router();

type GenerateImageFn = (generationId: string, userId: string, generationData: any, userApiKey?: string) => Promise<void>;
let _generateImageWithCivitAI: GenerateImageFn | null = null;

type SubmitTransformFn = (generationId: string, userId: string, params: {
  sourceImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  mode: "img2img" | "img2vid";
  modelId?: string;
  denoiseStrength?: number;
  steps?: number;
  cfgScale?: number;
  scheduler?: string;
  width?: number;
  height?: number;
  seed?: number;
  videoEngine?: string;
  durationSeconds?: number;
  fps?: number;
  motionStrength?: number;
}, userApiKey?: string) => Promise<void>;
let _submitTransformFn: SubmitTransformFn | null = null;

type BatchTracker = Map<string, { totalImages: number, completedImages: number, userId: string, firstImageClaimed: boolean }>;
let _batchTracker: BatchTracker | null = null;

export function setGenerateImageHandler(handler: GenerateImageFn) {
  _generateImageWithCivitAI = handler;
}

export function setBatchTracker(tracker: BatchTracker) {
  _batchTracker = tracker;
}

export function setSubmitTransformHandler(fn: SubmitTransformFn) {
  _submitTransformFn = fn;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  const prefix = "cv_";
  const random = crypto.randomBytes(32).toString("hex");
  return prefix + random;
}

async function hashBotPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function verifyBotPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

router.post("/login", async (req: Request, res: Response) => {
  try {
    const loginSchema = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    });
    const { username, password } = loginSchema.parse(req.body);

    const user = await storage.getUserByUsername(username);
    if (!user || !user.botPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    let passwordValid = false;
    if (user.botPassword.length === 64 && /^[a-f0-9]{64}$/.test(user.botPassword)) {
      const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
      if (legacyHash === user.botPassword) {
        passwordValid = true;
        const upgradedHash = await hashBotPassword(password);
        await storage.updateUser(user.id, { botPassword: upgradedHash });
        logger.info(`🔄 Upgraded legacy SHA-256 password to bcrypt for ${user.username}`);
      }
    } else {
      passwordValid = await verifyBotPassword(password, user.botPassword);
    }
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (user.isLocked) {
      return res.status(403).json({ error: "Account is locked" });
    }

    const keys = await storage.getUserApiKeys(user.id);
    const activeKeys = keys.filter(k => k.isActive);

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.substring(0, 10) + "...";

    for (const key of activeKeys) {
      await storage.deactivateApiKey(key.id, user.id);
    }

    const dailyLimit = activeKeys[0]?.dailyLimit || 5000;
    await storage.createApiKey(user.id, `${user.displayName || user.username} API Key`, keyHash, keyPrefix, dailyLimit);

    logger.info(`🔐 Bot login: ${username} - API key rotated`);

    res.json({
      userId: user.id,
      username: user.username,
      credits: user.buzzCredits || 0,
      apiKey: rawKey,
      message: "Login successful. Use this API key in the Authorization header: Bearer <api_key>",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    logger.error("API v1 login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <api_key>" });
  }

  const rawKey = authHeader.slice(7);
  const keyHash = hashApiKey(rawKey);

  const apiKey = await storage.getApiKeyByHash(keyHash);
  if (!apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  if (!apiKey.isActive) {
    return res.status(403).json({ error: "API key has been revoked" });
  }

  const rateCheck = await storage.checkApiKeyRateLimit(apiKey.id);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: "Daily rate limit exceeded",
      usage: rateCheck.usage,
      limit: rateCheck.limit,
      resetsAt: "midnight UTC",
    });
  }

  req.apiKeyUserId = apiKey.userId;
  req.apiKeyId = apiKey.id;
  next();
}

router.use(apiKeyAuth);

// GET /api/v1/account
router.get("/account", async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.apiKeyUserId!);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const keys = await storage.getUserApiKeys(req.apiKeyUserId!);
    const activeKey = keys.find(k => k.id === req.apiKeyId);

    res.json({
      id: user.id,
      username: user.username,
      credits: user.buzzCredits || 0,
      totalGenerated: user.totalGenerated || 0,
      dailyUsage: activeKey?.dailyUsage || 0,
      dailyLimit: activeKey?.dailyLimit || 5000,
    });
  } catch (error) {
    logger.error("API v1 account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/models
router.get("/models", async (req: Request, res: Response) => {
  try {
    const models = await storage.getAllModels();
    res.json({
      models: models.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        baseModel: m.baseModel,
        civitaiId: m.civitaiId,
        imageUrl: m.imageUrl,
        isNSFW: m.isNSFW,
      })),
    });
  } catch (error) {
    logger.error("API v1 models error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/models/:id
router.get("/models/:id", async (req: Request, res: Response) => {
  try {
    const model = await storage.getModelById(req.params.id);
    if (!model) return res.status(404).json({ error: "Model not found" });

    res.json({
      id: model.id,
      name: model.name,
      type: model.type,
      baseModel: model.baseModel,
      civitaiId: model.civitaiId,
      imageUrl: model.imageUrl,
      isNSFW: model.isNSFW,
    });
  } catch (error) {
    logger.error("API v1 model detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/characters
router.get("/characters", async (req: Request, res: Response) => {
  try {
    const userChars = await storage.getUserCharacters(req.apiKeyUserId!);
    const publicChars = await storage.getPublicCharacters();
    const allChars = [...userChars, ...publicChars.filter(pc => !userChars.some(uc => uc.id === pc.id))];

    res.json({
      characters: allChars.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        basePrompt: c.basePrompt,
        negativePrompt: c.negativePrompt,
        tags: c.tags,
        baseModel: c.baseModel,
        loras: c.loras,
      })),
    });
  } catch (error) {
    logger.error("API v1 characters error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/generate
const CYBER_PONY_CIVITAI_ID = "443821";
let DEFAULT_API_MODEL_ID = ""; // Resolved at runtime from CivitAI ID

async function resolveDefaultModelId(): Promise<string> {
  if (DEFAULT_API_MODEL_ID) return DEFAULT_API_MODEL_ID;
  const model = await storage.getModelByCivitaiId(CYBER_PONY_CIVITAI_ID);
  if (model) {
    DEFAULT_API_MODEL_ID = model.id;
    return model.id;
  }
  throw new Error("CyberRealistic Pony model not found in database");
}

const generateSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional().default(""),
  modelId: z.string().optional().default("auto"),
  width: z.number().int().min(256).max(2048).optional().default(832),
  height: z.number().int().min(256).max(2048).optional().default(1216),
  steps: z.number().int().min(1).max(50).optional().default(28),
  cfgScale: z.number().min(1).max(20).optional().default(7),
  seed: z.number().int().optional(),
  scheduler: z.string().optional().default("Euler"),
  clipSkip: z.number().int().min(1).max(12).optional().default(2),
  quantity: z.number().int().min(1).max(12).optional().default(1),
  loras: z.array(z.object({
    id: z.string(),
    strength: z.number(),
  })).optional().default([]),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  sceneName: z.string().optional(),
  sourceImageUrl: z.string().url().optional(),
  generationType: z.enum(["txt2img", "img2img"]).optional().default("txt2img"),
});

const generateVideoSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional().default(""),
  sourceImageUrl: z.string().url(),
  // Public API uses short names for stability. These are mapped to internal
  // canonical engine IDs before dispatching to the orchestration layer.
  videoEngine: z.enum(["haiper", "kling", "wan", "minimax"]).optional().default("wan"),
  durationSeconds: z.number().int().min(1).max(10).optional().default(4),
  fps: z.number().int().min(8).max(30).optional().default(16),
  motionStrength: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
});

// Map public short names (v1 API contract) → internal canonical engine IDs
// used by the transform orchestration layer (TransformRequest.videoEngine).
const SHORT_ENGINE_TO_CANONICAL: Record<string, string> = {
  wan:     "wan-comfy-2.1",
  kling:   "kling-2.5",
  haiper:  "wan-comfy-2.1", // haiper not yet supported; fall back to WAN
  minimax: "wan-comfy-2.1", // minimax not yet supported; fall back to WAN
};

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const data = generateSchema.parse(req.body);
    const userId = req.apiKeyUserId!;

    // Detect generation type early so we can compute cost correctly.
    const genType = data.sourceImageUrl ? "img2img" : (data.generationType || "txt2img");

    if (genType !== "img2img") {
      // Force default model only for txt2img; img2img uses the caller's modelId.
      data.modelId = await resolveDefaultModelId();
    } else if (!data.modelId || data.modelId === "auto") {
      data.modelId = await resolveDefaultModelId();
    }

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const userApiKey = await storage.getUserApiKey(userId);

    // Cost: img2img uses transform pricing (admin-tunable); txt2img uses per-image credits.
    let requiredCredits: number;
    if (genType === "img2img") {
      const setting = await storage.getPlatformSetting("transform_img2img_cost");
      requiredCredits = setting
        ? parseInt(setting.value, 10)
        : parseInt(process.env.TRANSFORM_IMG2IMG_COST || "15", 10);
    } else {
      const creditsPerImage = userApiKey ? 4 : 12;
      requiredCredits = (data.quantity || 1) * creditsPerImage;
    }

    if ((user.buzzCredits || 0) < requiredCredits) {
      return res.status(400).json({
        error: "Insufficient credits",
        required: requiredCredits,
        available: user.buzzCredits || 0,
      });
    }

    const sanitizedPrompt = civitaiService.sanitizePromptAges(data.prompt);
    const sanitizedNegative = civitaiService.sanitizeNegativePrompt(data.negativePrompt || "");

    const validatedData = insertGenerationSchema.parse({
      ...data,
      cfgScale: data.cfgScale || 7,
      prompt: sanitizedPrompt,
      negativePrompt: sanitizedNegative,
      generationType: genType,
      denoiseStrength: genType === "img2img" ? ((data as { denoiseStrength?: number }).denoiseStrength || 75) : 75,
      ...(data.sourceImageUrl ? { sourceImageUrl: data.sourceImageUrl } : {}),
    });

    const generation = await storage.createGeneration({
      ...validatedData,
      userId,
    });

    const newCredits = Math.max(0, (user.buzzCredits || 0) - requiredCredits);
    await storage.updateUserCredits(userId, newCredits);
    await storage.incrementApiKeyUsage(req.apiKeyId!);

    const quantity = genType === "img2img" ? 1 : (data.quantity || 1);
    if (_batchTracker) {
      _batchTracker.set(generation.id, {
        totalImages: quantity,
        completedImages: 0,
        userId: userId,
        firstImageClaimed: false,
        ...(genType === "img2img" ? { transformCost: requiredCredits } : {}),
      } as any);
      logger.info(`🎯 API v1 BATCH TRACKER: Initialized ${generation.id} (${genType}, ${quantity} image(s))`);
    } else {
      logger.warn(`⚠️ API v1: batchTracker not available`);
    }

    res.json({
      generationId: generation.id,
      status: "processing",
      generationType: genType,
      creditsUsed: requiredCredits,
      creditsRemaining: newCredits,
      quantity: quantity,
    });

    if (genType === "img2img" && data.sourceImageUrl) {
      if (_submitTransformFn) {
        _submitTransformFn(generation.id, userId, {
          mode: "img2img",
          sourceImageUrl: data.sourceImageUrl,
          prompt: sanitizedPrompt,
          negativePrompt: sanitizedNegative,
          modelId: data.modelId,
          // Orchestration expects 0–1 float; API schema stores percent (0–100).
          // Default: 0.75 (75% strength). Cap to valid range.
          denoiseStrength: Math.min(1, Math.max(0, ((data as any).denoiseStrength ?? 75) / 100)),
          steps: data.steps || 20,
          cfgScale: data.cfgScale || 7,
          scheduler: data.scheduler || "Euler",
          width: data.width || 1024,
          height: data.height || 1024,
          seed: data.seed,
        }, userApiKey || undefined).catch(err => {
          logger.error(`❌ API v1 img2img failed for ${generation.id}:`, err);
        });
      } else {
        logger.error("❌ submitTransformFn not registered - img2img will remain pending");
      }
    } else if (_generateImageWithCivitAI) {
      const generationData = { ...validatedData, quantity: data.quantity || 1 };
      _generateImageWithCivitAI(generation.id, userId, generationData, userApiKey || undefined).catch(err => {
        logger.error(`❌ API v1 CivitAI generation failed for ${generation.id}:`, err);
      });
    } else {
      logger.error("❌ generateImageWithCivitAI handler not registered - generation will remain pending");
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 generate error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/generations/:id
router.get("/generations/:id", async (req: Request, res: Response) => {
  try {
    const generation = await storage.getGeneration(req.params.id);
    if (!generation) return res.status(404).json({ error: "Generation not found" });
    if (generation.userId !== req.apiKeyUserId) return res.status(403).json({ error: "Access denied" });

    const batchInfo = _batchTracker?.get(req.params.id);
    const totalImages = batchInfo?.totalImages || generation.quantity || 1;
    const completedImages = batchInfo?.completedImages || (generation.status === "completed" ? totalImages : 0);

    const allGenerations = await storage.getUserGenerations(generation.userId);
    const batchImages = allGenerations
      .filter((g: any) => g.id === req.params.id || g.batchId === req.params.id)
      .map((g: any) => ({
        id: g.id,
        imageUrl: g.imageUrl,
        seed: g.seed,
        status: g.status,
      }));

    res.json({
      id: generation.id,
      status: generation.status,
      generationType: (generation as any).generationType || "txt2img",
      prompt: generation.prompt,
      negativePrompt: generation.negativePrompt,
      modelId: generation.modelId,
      imageUrl: generation.imageUrl,
      videoUrl: (generation as any).videoUrl || null,
      videoThumbnailUrl: (generation as any).videoThumbnailUrl || null,
      videoDurationSeconds: (generation as any).videoDurationSeconds || null,
      videoFps: (generation as any).videoFps || null,
      videoModelEngine: (generation as any).videoModelEngine || null,
      seed: generation.seed,
      width: generation.width,
      height: generation.height,
      steps: generation.steps,
      cfgScale: generation.cfgScale,
      scheduler: generation.scheduler,
      loras: generation.loras,
      cost: generation.cost,
      createdAt: generation.createdAt,
      completedAt: generation.completedAt,
      quantity: totalImages,
      completedImages: completedImages,
      images: batchImages,
    });
  } catch (error) {
    logger.error("API v1 generation status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/generations
router.get("/generations", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await storage.getPaginatedUserRecentGenerations(req.apiKeyUserId!, limit, offset);
    res.json({
      generations: result.generations.map(g => ({
        id: g.id,
        status: g.status,
        prompt: g.prompt,
        imageUrl: g.imageUrl,
        modelId: g.modelId,
        cost: g.cost,
        createdAt: g.createdAt,
        completedAt: g.completedAt,
      })),
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (error) {
    logger.error("API v1 generations list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/story
const storySchema = z.object({
  imagePrompt: z.string().min(1),
  userComments: z.string().optional().default(""),
  pov: z.enum(["first_person", "character", "third_person"]).optional().default("first_person"),
  storyLength: z.enum(["short", "medium", "long"]).optional().default("medium"),
  persona: z.object({
    age: z.string().optional(),
    gender: z.string().optional(),
    build: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
});

router.post("/story", async (req: Request, res: Response) => {
  try {
    const { imagePrompt, userComments, pov, storyLength, persona } = storySchema.parse(req.body);

    await storage.incrementApiKeyUsage(req.apiKeyId!);

    const povInstructions: Record<string, string> = {
      first_person: `Write from the reader's perspective (I/me). The reader is experiencing the encounter with the character. Use "I" for the narrator (reader) and "she/her" for the character.`,
      character: `Write from the WOMAN'S/CHARACTER'S perspective (I/me). She is the narrator. Use "I" for the woman. The other person is "he/him/you".`,
      third_person: `Write in third person. Use he/she/they to describe both characters from outside.`,
    };

    const wordCounts: Record<string, string> = {
      short: "400-600",
      medium: "600-900",
      long: "800-1200",
    };

    const systemPrompt = `You are an erotic fiction writer. Write explicit, graphic, adult-only sexual content.
Rules:
- Point of View: ${povInstructions[pov]}
- Write approximately ${wordCounts[storyLength]} words
- DO NOT include a title or chapter heading
- Be extremely explicit and graphic
- Include dirty dialogue
- Focus on physical sensations and emotions`;

    let userMessage = `Image/Scene: ${imagePrompt}`;
    if (userComments) userMessage += `\n\nAdditional directions: ${userComments}`;
    if (persona) {
      let personaDesc = "\n\nReader persona:";
      if (persona.age) personaDesc += ` Age: ${persona.age}.`;
      if (persona.gender) personaDesc += ` Gender: ${persona.gender}.`;
      if (persona.build) personaDesc += ` Build: ${persona.build}.`;
      if (persona.description) personaDesc += ` Description: ${persona.description}.`;
      userMessage += personaDesc;
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });

    const response = await openai.chat.completions.create({
      model: "deepseek/deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 2000,
    });

    const story = response.choices[0]?.message?.content || "";

    res.json({ story });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 story error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/tts
const ttsApiSchema = z.object({
  text: z.string().min(1),
  model: z.enum(["openai", "kokoro"]).optional().default("openai"),
  voice: z.string().optional().default("nova"),
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
});

const VALID_KOKORO_VOICES = [
  "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
];

router.post("/tts", async (req: Request, res: Response) => {
  try {
    const ttsParams = ttsApiSchema.parse(req.body);
    const { text, model, speed } = ttsParams;
    let { voice } = ttsParams;

    await storage.incrementApiKeyUsage(req.apiKeyId!);

    if (model === "kokoro") {
      if (!VALID_KOKORO_VOICES.includes(voice)) voice = "af_bella";

      if (!process.env.REPLICATE_API_TOKEN) {
        return res.status(500).json({ error: "Kokoro TTS not configured" });
      }

      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
      const prediction = await replicate.predictions.create({
        version: "f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13",
        input: { text, voice, speed },
      });

      let result = prediction;
      while (result.status !== "succeeded" && result.status !== "failed") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await replicate.predictions.get(prediction.id);
      }

      if (result.status === "failed") {
        return res.status(500).json({ error: "Audio generation failed" });
      }

      res.json({ audioUrl: result.output });
    } else {
      const openaiTTS = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await openaiTTS.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice: voice as any, format: "mp3" },
        messages: [
          { role: "system", content: "Read the following text aloud exactly as written, with natural pacing." },
          { role: "user", content: text },
        ],
      });

      const audioData = (completion.choices[0]?.message as any)?.audio?.data;
      if (audioData) {
        res.json({ audioBase64: audioData, format: "mp3" });
      } else {
        res.status(500).json({ error: "No audio generated" });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 TTS error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── SCENES ─────────────────────────────────────────────────────────────────

// GET /api/v1/scenes
router.get("/scenes", async (req: Request, res: Response) => {
  try {
    const userId = req.apiKeyUserId!;
    const userScenes = await storage.getUserSavedScenes(userId);
    const sharedScenes = await storage.getSharedScenes();
    const allScenes = [
      ...userScenes,
      ...sharedScenes.filter(s => !userScenes.some(u => u.id === s.id)),
    ];
    res.json({
      scenes: allScenes.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        prompt: s.prompt,
        locationCategory: s.locationCategory,
        location: s.location,
        outfitCategory: s.outfitCategory,
        outfit: s.outfit,
        poseCategory: s.poseCategory,
        pose: s.pose,
        tags: s.tags,
        isShared: s.isShared,
        isFavorite: s.isFavorite,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    logger.error("API v1 scenes list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/scenes/:id
router.get("/scenes/:id", async (req: Request, res: Response) => {
  try {
    const scene = await storage.getSavedScene(req.params.id);
    if (!scene) return res.status(404).json({ error: "Scene not found" });
    if (scene.userId !== req.apiKeyUserId && !scene.isShared) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json({
      id: scene.id,
      title: scene.title,
      description: scene.description,
      prompt: scene.prompt,
      locationCategory: scene.locationCategory,
      location: scene.location,
      outfitCategory: scene.outfitCategory,
      outfit: scene.outfit,
      poseCategory: scene.poseCategory,
      pose: scene.pose,
      tags: scene.tags,
      isShared: scene.isShared,
      isFavorite: scene.isFavorite,
      sceneData: scene.sceneData,
      createdAt: scene.createdAt,
    });
  } catch (error) {
    logger.error("API v1 scene detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const createSceneSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  description: z.string().optional(),
  locationCategory: z.string().optional(),
  location: z.string().optional(),
  outfitCategory: z.string().optional(),
  outfit: z.string().optional(),
  poseCategory: z.string().optional(),
  pose: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isShared: z.boolean().optional().default(false),
  sceneData: z.record(z.string()).optional(),
});

// POST /api/v1/scenes
router.post("/scenes", async (req: Request, res: Response) => {
  try {
    const data = createSceneSchema.parse(req.body);
    const scene = await storage.createSavedScene({
      ...data,
      userId: req.apiKeyUserId!,
    });
    res.status(201).json({
      id: scene.id,
      title: scene.title,
      prompt: scene.prompt,
      createdAt: scene.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 scene create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/v1/scenes/:id
router.delete("/scenes/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteSavedScene(req.params.id, req.apiKeyUserId!);
    if (!deleted) return res.status(404).json({ error: "Scene not found or access denied" });
    res.json({ success: true });
  } catch (error) {
    logger.error("API v1 scene delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── EVENTS ─────────────────────────────────────────────────────────────────

// GET /api/v1/events
router.get("/events", async (req: Request, res: Response) => {
  try {
    const userId = req.apiKeyUserId!;
    const eventList = await storage.getUserEvents(userId);
    const eventsWithSteps = await Promise.all(
      eventList.map(async (ev) => {
        const steps = await storage.getEventSteps(ev.id, userId);
        return {
          id: ev.id,
          title: ev.title,
          description: ev.description,
          isActive: ev.isActive,
          createdAt: ev.createdAt,
          steps: steps.map(s => ({
            id: s.id,
            stepNumber: s.stepNumber,
            title: s.title,
            description: s.description,
            wordsToAdd: s.wordsToAdd,
            wordsToRemove: s.wordsToRemove,
          })),
        };
      })
    );
    res.json({ events: eventsWithSteps });
  } catch (error) {
    logger.error("API v1 events list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/events/:id
router.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.apiKeyUserId!;
    const eventList = await storage.getUserEvents(userId);
    const ev = eventList.find(e => e.id === req.params.id);
    if (!ev) return res.status(404).json({ error: "Event not found" });
    const steps = await storage.getEventSteps(ev.id, userId);
    res.json({
      id: ev.id,
      title: ev.title,
      description: ev.description,
      isActive: ev.isActive,
      createdAt: ev.createdAt,
      steps: steps.map(s => ({
        id: s.id,
        stepNumber: s.stepNumber,
        title: s.title,
        description: s.description,
        wordsToAdd: s.wordsToAdd,
        wordsToRemove: s.wordsToRemove,
      })),
    });
  } catch (error) {
    logger.error("API v1 event detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

// POST /api/v1/events
router.post("/events", async (req: Request, res: Response) => {
  try {
    const data = createEventSchema.parse(req.body);
    const ev = await storage.createEvent({ ...data, userId: req.apiKeyUserId! });
    res.status(201).json({ id: ev.id, title: ev.title, createdAt: ev.createdAt, steps: [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 event create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/v1/events/:id
router.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteEvent(req.params.id, req.apiKeyUserId!);
    if (!deleted) return res.status(404).json({ error: "Event not found or access denied" });
    res.json({ success: true });
  } catch (error) {
    logger.error("API v1 event delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const createStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  wordsToAdd: z.array(z.string()).optional().default([]),
  wordsToRemove: z.array(z.string()).optional().default([]),
});

// POST /api/v1/events/:id/steps
router.post("/events/:id/steps", async (req: Request, res: Response) => {
  try {
    const userId = req.apiKeyUserId!;
    const eventList = await storage.getUserEvents(userId);
    const ev = eventList.find(e => e.id === req.params.id);
    if (!ev) return res.status(404).json({ error: "Event not found" });

    const data = createStepSchema.parse(req.body);
    const step = await storage.createEventStep({ ...data, eventId: ev.id });
    res.status(201).json({
      id: step.id,
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      wordsToAdd: step.wordsToAdd,
      wordsToRemove: step.wordsToRemove,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 step create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateStepSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  stepNumber: z.number().int().min(1).optional(),
  wordsToAdd: z.array(z.string()).optional(),
  wordsToRemove: z.array(z.string()).optional(),
});

// PUT /api/v1/events/:id/steps/:stepId
router.put("/events/:id/steps/:stepId", async (req: Request, res: Response) => {
  try {
    const data = updateStepSchema.parse(req.body);
    const step = await storage.updateEventStep(req.params.stepId, data, req.apiKeyUserId!);
    if (!step) return res.status(404).json({ error: "Step not found or access denied" });
    res.json({
      id: step.id,
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      wordsToAdd: step.wordsToAdd,
      wordsToRemove: step.wordsToRemove,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 step update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/v1/events/:id/steps/:stepId
router.delete("/events/:id/steps/:stepId", async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteEventStep(req.params.stepId, req.apiKeyUserId!);
    if (!deleted) return res.status(404).json({ error: "Step not found or access denied" });
    res.json({ success: true });
  } catch (error) {
    logger.error("API v1 step delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── EASY GENERATE ──────────────────────────────────────────────────────────

const easyGenerateSchema = z.object({
  characterId: z.string().optional(),
  sceneId: z.string().optional(),
  characterAge: z.number().int().min(18).max(99).optional(),
  extraPrompt: z.string().optional().default(""),
  quantity: z.number().int().min(1).max(12).optional().default(1),
});

// POST /api/v1/easy-generate
router.post("/easy-generate", async (req: Request, res: Response) => {
  try {
    const data = easyGenerateSchema.parse(req.body);
    const userId = req.apiKeyUserId!;

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "Account not found" });

    // Resolve character
    let character: any = null;
    if (data.characterId) {
      const chars = await storage.getUserCharacters(userId);
      const publicChars = await storage.getPublicCharacters();
      character = [...chars, ...publicChars].find(c => c.id === data.characterId);
      if (!character) return res.status(404).json({ error: "Character not found" });
    }

    // Resolve scene
    let scene: any = null;
    if (data.sceneId) {
      scene = await storage.getSavedScene(data.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      if (scene.userId !== userId && !scene.isShared) {
        return res.status(403).json({ error: "Access denied to scene" });
      }
    }

    // Build combined prompt (mirrors easy-mode.tsx logic)
    let combinedPrompt = "masterpiece, best quality, ";

    if (character) {
      combinedPrompt += character.basePrompt || "";
      if (character.description) {
        combinedPrompt += ", " + character.description;
      }
      const age = data.characterAge ?? character.age ?? 20;
      combinedPrompt += ", " + age + "yo";
    }

    if (scene) {
      const sceneElements: string[] = [];
      if (scene.prompt) sceneElements.push(scene.prompt);
      if (scene.location) sceneElements.push("in " + scene.location);
      if (scene.outfit) sceneElements.push("wearing " + scene.outfit);
      if (scene.pose) sceneElements.push(scene.pose);

      if (sceneElements.length > 0) {
        const sceneText = sceneElements.join(", ");
        const terms = sceneText.split(",").map((t: string) => t.trim());
        const seenTerms = new Set<string>();
        const uniqueTerms: string[] = [];
        for (const term of terms) {
          const norm = term.toLowerCase();
          if (!seenTerms.has(norm) && term !== "") {
            seenTerms.add(norm);
            uniqueTerms.push(term);
          }
        }
        combinedPrompt += ", " + uniqueTerms.join(", ");
      }
    }

    if (data.extraPrompt) {
      combinedPrompt += ", " + data.extraPrompt;
    }

    // Check credits
    const userApiKey = await storage.getUserApiKey(userId);
    const creditsPerImage = userApiKey ? 4 : 12;
    const requiredCredits = (data.quantity || 1) * creditsPerImage;

    if ((user.buzzCredits || 0) < requiredCredits) {
      return res.status(400).json({
        error: "Insufficient credits",
        required: requiredCredits,
        available: user.buzzCredits || 0,
      });
    }

    const negativePrompt = civitaiService.sanitizeNegativePrompt(
      character?.negativePrompt || ""
    );
    const sanitizedPrompt = civitaiService.sanitizePromptAges(combinedPrompt);

    const modelId = await resolveDefaultModelId();

    const validatedData = insertGenerationSchema.parse({
      prompt: sanitizedPrompt,
      negativePrompt,
      modelId,
      width: 832,
      height: 1216,
      steps: 28,
      cfgScale: 7,
      seed: undefined,
      scheduler: "Euler",
      clipSkip: 2,
      quantity: data.quantity || 1,
      loras: character?.loras || [],
      characterId: data.characterId,
      characterName: character?.name,
      sceneName: scene?.title,
      generationType: "txt2img",
      denoiseStrength: 75,
    });

    const generation = await storage.createGeneration({ ...validatedData, userId });

    const newCredits = Math.max(0, (user.buzzCredits || 0) - requiredCredits);
    await storage.updateUserCredits(userId, newCredits);
    await storage.incrementApiKeyUsage(req.apiKeyId!);

    if (_batchTracker) {
      _batchTracker.set(generation.id, {
        totalImages: data.quantity || 1,
        completedImages: 0,
        userId,
        firstImageClaimed: false,
      });
    }

    res.json({
      generationId: generation.id,
      status: "processing",
      prompt: sanitizedPrompt,
      characterName: character?.name || null,
      sceneName: scene?.title || null,
      creditsUsed: requiredCredits,
      creditsRemaining: newCredits,
      quantity: data.quantity || 1,
    });

    if (_generateImageWithCivitAI) {
      _generateImageWithCivitAI(generation.id, userId, {
        ...validatedData,
        quantity: data.quantity || 1,
      }, userApiKey || undefined).catch((err: any) => {
        logger.error(`❌ API v1 easy-generate CivitAI failed for ${generation.id}:`, err);
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 easy-generate error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/generate-video
router.post("/generate-video", async (req: Request, res: Response) => {
  try {
    const data = generateVideoSchema.parse(req.body);
    const userId = req.apiKeyUserId!;

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const vidCostSetting = await storage.getPlatformSetting("transform_img2vid_cost");
    const COST = vidCostSetting
      ? parseInt(vidCostSetting.value, 10)
      : parseInt(process.env.TRANSFORM_IMG2VID_COST || "80", 10);
    if ((user.buzzCredits || 0) < COST) {
      return res.status(400).json({ error: "Insufficient credits", required: COST, available: user.buzzCredits || 0 });
    }

    const sanitizedPrompt = civitaiService.sanitizePromptAges(data.prompt);
    const sanitizedNegative = civitaiService.sanitizeNegativePrompt(data.negativePrompt || "");

    const generation = await storage.createGeneration({
      userId,
      prompt: sanitizedPrompt,
      negativePrompt: sanitizedNegative,
      modelId: undefined as any,
      width: 1024,
      height: 576,
      steps: 30,
      cfgScale: 70,
      scheduler: "Euler",
      clipSkip: 2,
      quantity: 1,
      loras: [],
      generationType: "img2vid",
      sourceImageUrl: data.sourceImageUrl,
      denoiseStrength: 75,
      seed: data.seed ?? -1,
    } as any);

    const newCredits = Math.max(0, (user.buzzCredits || 0) - COST);
    await storage.updateUserCredits(userId, newCredits);
    await storage.incrementApiKeyUsage(req.apiKeyId!);

    if (_batchTracker) {
      _batchTracker.set(generation.id, {
        totalImages: 1, completedImages: 0, userId, firstImageClaimed: false, transformCost: COST,
      } as any);
    }

    const userApiKey = await storage.getUserApiKey(userId);

    res.json({
      generationId: generation.id,
      status: "processing",
      creditsUsed: COST,
      creditsRemaining: newCredits,
    });

    if (_submitTransformFn) {
      const canonicalEngine = SHORT_ENGINE_TO_CANONICAL[data.videoEngine || "wan"] || "wan-comfy-2.1";
      _submitTransformFn(generation.id, userId, {
        sourceImageUrl: data.sourceImageUrl,
        prompt: sanitizedPrompt,
        negativePrompt: sanitizedNegative,
        mode: "img2vid",
        videoEngine: canonicalEngine as any,
        durationSeconds: data.durationSeconds,
        fps: data.fps,
        motionStrength: data.motionStrength,
        seed: data.seed,
      }, userApiKey || undefined).catch(err => {
        logger.error(`❌ API v1 generate-video failed for ${generation.id}:`, err);
      });
    } else {
      logger.error("❌ submitTransformFn not registered - video generation will remain pending");
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("API v1 generate-video error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API Key Management endpoints (require session auth, not API key auth)
// These are registered separately in routes.ts

export { router as apiV1Router, generateApiKey, hashApiKey, hashBotPassword };
